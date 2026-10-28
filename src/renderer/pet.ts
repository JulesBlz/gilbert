// Gilbert lui-même : états, déplacements, réactions à la souris.
// Coordonnées en px CSS : `x` = centre de la frame, `y` = bas de la frame (le sol = bas de la fenêtre).
//
// - Il se déplace en marchant, ou par bonds pour aller plus loin.
// - Toutes les animations tournent à la même cadence (FRAME) et reviennent à la pose assise de référence.
// - Si personne ne joue avec lui pendant 20 à 30 s, il saute se cacher au-dessus du haut de
//   l'écran : seule sa queue pend. On tire la queue pour le faire tomber.
// - Un clic sur la queue le fait aussi descendre, prêt à discuter.
// - Quand tu reviens après une absence, sa queue s'agite pour te dire bonjour.
// - Quand on l'attrape, il pend par la queue et se débat.
// - En session de travail, il tape sur son petit ordinateur : ni clic ni prise ne l'en détournent
//   (un clic ouvre juste une petite bulle pour voir le temps restant, ou arrêter).
// - Quand sa fenêtre s'ouvre, il saute s'asseoir sur son bord du haut (c'est son sol tant qu'elle
//   est ouverte) ; quand elle se ferme, il redescend d'un bond.
// - Il vit dans une vieille poubelle ronde : il en sort au lancement. Pour quitter, on l'attrape et
//   on le lâche dedans (elle apparaît en bas à gauche dès qu'on le prend), ou « Quitter » : il y saute.
//   Installé, sa poubelle est son icône sur le bureau : il en sort et y rentre, sans en dessiner une.

import { drawFrame, drawFrameRotated, isOpaque, SIZE, BASE, GRAB, HANG_LENGTH, type FrameName } from './sprites';
import { drawGlyph } from './glyphs';
import { sfx, voice } from './audio';
import type { Bubble, SayOptions, Stream } from './bubble';
import { lines, pick } from './lines';
import { drawGrid } from '../shared/pixels';
import dumpUrl from '../../assets/dumpster.png';
import { DUMP, dumpBox, type DumpBox } from '../shared/dumpster';
import { PIXEL, type Home, type Settings } from '../shared/types';

type State =
  | 'idle' | 'walk' | 'talk' | 'laugh' | 'alert' | 'happy'
  | 'listen' | 'think'
  | 'drag' | 'fly' | 'fall' | 'land'
  | 'crouch' | 'jump' | 'hidden' | 'pull' | 'work'
  | 'leap'
  /** dans sa poubelle (au lancement, ou quand on quitte) */
  | 'binned';

const AWAY_AFTER = 60;         // s sans clavier ni souris : tu es parti
const GRAVITY = 2400;          // px/s², chutes
// saut vers le haut de l'écran : durée voulue (s), quelle que soit la hauteur, et vitesse restante
// en arrivant (px/s) : il ralentit à la fin, comme au sommet d'un vrai saut
const JUMP = { duration: 0.6, arrive: 220 };
// bond vers sa fenêtre (ou pour en redescendre) : durée selon la distance, hauteur de la courbe
// au-dessus du point le plus haut (pixels de Gilbert)
const LEAP = { base: 0.5, perPx: 1 / 2800, arc: 14 };
// sa poubelle : saut du couvercle (pixels de Gilbert, par s), et les temps de la sortie (s)
// Finder met un à deux secondes à redessiner l'icône du bureau : la nôtre reste donc affichée (opaque) un bon moment
// après le changement, et le départ attend avant de s'arrêter.
const BIN = { pop: 0.6, gone: 3, quitAfter: 0.8, shake: 0.45 };
const dumpImg = new Image();
dumpImg.src = dumpUrl;
const PULL_DISTANCE = 10;      // en pixels de Gilbert : traction nécessaire pour le faire tomber
const VOWEL = /[aeiouyàâéèêëîïôöùûü]/i;
interface V { x: number; y: number }

/**
 * Tenu par la queue : une petite chaîne à deux segments (curseur → base de la queue → corps),
 * simulée par intégration de Verlet. La queue pivote sur le curseur, le corps sur la base de la
 * queue ; l'angle entre les deux est limité pour que l'articulation reste crédible.
 */
// Gravité forte et amortissement marqué : il pèse, se balance peu et se calme vite.
// La queue peut faire le tour complet de la main : on peut le faire tourner en moulinet.
const RIG = { gravity: 4200, damping: 0.988, step: 1 / 120, maxBend: 0.55, iterations: 6 };
// en vol, une fois lâché : frottement de l'air, rotation freinée, rebonds mous sur les bords
// align : comme une girouette, le corps (plus lourd) passe devant et la queue suit derrière,
// d'autant moins qu'il tourne vite (lancé en moulinet, il continue de tourner)
const FLY = { gravity: 3400, drag: 0.9, spinDrag: 1.2, maxSpin: 14, align: 10, bounce: 0.3, maxSpeed: 2200 };
/**
 * Le lancer part avec la vitesse du corps, moyennée sur ses dernières ms (une seule frame est trop
 * bruitée). Il ne garde toute sa rotation que s'il faisait vraiment le moulinet (un tour presque
 * complet dans la dernière demi-seconde) ; sinon il tourne juste un peu dans le sens du geste.
 */
const THROW = { window: 0.06, twirlWindow: 0.5, twirl: 1.6 * Math.PI, flickSpin: 0.35 };
/** Pour éviter le scintillement des pixels tournés, les angles sont arrondis à ce pas */
const ANGLE_STEP = Math.PI / 30;

/** Cadence commune à toutes les animations (s par frame) */
const FRAME = 0.1;
// un bond de déplacement (8 frames) : distance et hauteur (pixels de Gilbert)
// Entre deux bonds enchaînés, la réception et l'appel sont écourtés (ground, en s) et il continue
// d'avancer un peu (glide, part du bond) : pas d'arrêt net entre deux sauts.
const HOP = { frame: 0.08, distance: 16, height: 6, ground: 0.04, glide: 0.12 };
// un pas complet en 6 temps (voir tools/gen-sprites.mjs)
const WALK = { frame: FRAME, speed: 20, frames: 6 };
// petits sauts sur place (rire) : frames 1 à 5 de la planche, et leur hauteur
const BOUNCE = { first: 1, heights: [0, 3, 6, 3, 0] };
type Frames<P extends string> = Extract<FrameName, `${P}${number}`>;
const seq = <P extends string>(prefix: P, i: number) => `${prefix}${i}` as Frames<P>;
// tête de la base assise dans la frame (pour la bulle et le « ! »)
const HEAD_TOP = SIZE - BASE.height;
const HEAD_CENTER = BASE.x + 7;

export class Pet {
  x = 0;
  y = 0;
  /** -1 = regarde à gauche (sens du dessin d'origine), 1 = à droite (sprite retourné) */
  dir: 1 | -1 = -1;
  state: State = 'idle';
  private t = 0;
  private vy = 0;
  private hopT = 0;
  private move: 'walk' | 'hop' = 'walk';
  private hopFrom = 0;
  private hopTo = 0;
  private jumpGravity = 0;
  /** Durées de l'appel et de la réception du bond en cours (écourtées quand les bonds s'enchaînent) */
  private hopCrouch = HOP.frame;
  private hopLand = HOP.frame;
  /** Le bond en cours suit directement un autre */
  private hopChain = false;
  private nextDecision = 4;
  private targetX = 0;
  private blink = { wait: 3, left: 0 };
  /** 0 fermée, 1 entrouverte (consonne), 2 grande ouverte (voyelle) */
  private mouth: 0 | 1 | 2 = 0;
  private pending: string | null = null;
  private pendingActions: SayOptions['actions'];
  private afterLand: (() => void) | null = null;
  private silentLanding = false;
  private lastInteraction = Date.now();
  private hideDelay = 25;
  private userAway = false;
  private tail = { drop: 0, wiggle: 0, twitchIn: 8, pull: 0 };
  private press: { x: number; y: number; tail: boolean } | null = null;
  private dragging_ = false;
  private rig: { p0: V; p1: V; p2: V; q1: V; q2: V; a2: number; spin: number; acc: number; time: number; turn: number } | null = null;
  /** Dernières positions du corps (et angle cumulé), pour la vitesse au lâcher */
  private trail: { x: number; y: number; turn: number; t: number }[] = [];
  private flight: { x: number; y: number; vx: number; vy: number; angle: number; spin: number; peak: number } | null = null;
  private clicks: number[] = [];
  /** Appelé au clic ; renvoie true s'il a pris la main (ouvrir la discussion, par exemple) */
  clickHandler: (() => boolean) | null = null;
  /** On a joué avec lui (clic, lancer) : nourrit son humeur */
  onPlay: ((kind: 'click' | 'throw') => void) | null = null;
  /** Son humeur (0 = boude, 1 = ravi), donnée par le process principal */
  mood = 0.6;
  /** Clic pendant une session de travail (il ne s'arrête pas : on montre juste où il en est) */
  onWorkClick: (() => void) | null = null;
  /** Fin de la session de travail en cours (ms), 0 sinon */
  focusEnds = 0;
  /** Sa fenêtre ouverte : il s'assoit sur son bord du haut, de `x0` à `x1`, à la hauteur `y` */
  private perch: { x0: number; x1: number; y: number } | null = null;
  /** Le bond en cours vers la fenêtre (ou pour en redescendre) ; `resume` : l'état à retrouver après */
  private leap: { fromX: number; fromY: number; toX: number; toY: number; t: number; duration: number; resume: State | null; lift?: number; ease?: 'in' | 'out' } | null = null;
  /**
   * Sa poubelle, quand elle est là : `out` il en sort, `standby` elle attend qu'on l'y lâche (on le
   * tient), `in` il y saute pour qu'on quitte. `front` : il est (en partie) dedans, caché derrière son
   * bord avant. `glow` : elle s'éclaire quand il approche. Sur le bureau, c'est l'icône de l'appli (on
   * ne dessine rien dessus) ; sinon (Windows, développement), il dessine la sienne.
   */
  private bin: { box: DumpBox; mode: 'out' | 'standby' | 'in'; t: number; alpha: number; popped: boolean; front: boolean; glow: number; shake: number } | null = null;
  /** Il est dans sa poubelle : on peut quitter */
  onQuit: (() => void) | null = null;
  /** Son icône de poubelle sur le bureau, s'il en a une (sinon il dessine la sienne) */
  private home: Home | null = null;
  /** On l'a fait descendre en tirant sa queue */
  onPulledDown: (() => void) | null = null;
  /** On vient de l'attraper : on relit où est son icône du bureau (elle a pu bouger) */
  onGrab: (() => void) | null = null;
  /** Gland qui tombe à côté de lui à la fin d'une session */
  private drop: { grid: string[]; x: number; y: number; vy: number; until: number } | null = null;
  /** Point au-dessus de la tête, pour y accrocher bulle et champ de saisie */
  anchor = { x: 0, y: 0 };

  constructor(
    public settings: Settings,
    private bubble: Bubble,
    private onPositionChange: (x: number) => void,
  ) {
    this.y = this.ground;
    this.x = settings.x ?? innerWidth - 160;
    this.clampX();
    this.touch();
  }

  get scale() { return PIXEL[this.settings.size] ?? 4; }
  /** Le sol : le bas de l'écran, ou le haut de sa fenêtre quand il est assis dessus */
  get ground() { return this.perch?.y ?? innerHeight; }
  /** Visio ou présentation en cours (détectée à l'écran) : il se tait comme en mode Chut */
  meeting = false;
  get quiet() { return this.meeting || this.settings.quietUntil > Date.now(); }
  get dragging() { return this.state === 'drag'; }
  /** Bouton de la souris enfoncé sur Gilbert ou sa queue */
  get holding() { return this.press !== null; }
  get onCeiling() { return this.state === 'hidden' || this.state === 'pull'; }
  get working() { return this.state === 'work'; }
  private get airborne() { return ['crouch', 'jump', 'fall', 'fly', 'leap'].includes(this.state); }
  private get size() { return SIZE * this.scale; }
  private get busy() { return this.bubble.visible || this.press !== null; }
  /** Les poses de face (pendu, chute, saut) ne se retournent pas */
  private get flip() {
    return this.dir > 0 && !this.onCeiling && !['drag', 'fall', 'jump'].includes(this.state);
  }

  // ---------- boucle ----------

  update(dt: number) {
    this.t += dt;
    this.updateBin(dt);
    if (this.drop) {
      const d = this.drop;
      d.vy += GRAVITY * dt;
      d.y = Math.min(d.y + d.vy * dt, this.ground - 10 * this.scale);
      if (Date.now() > d.until) this.drop = null;
    }
    switch (this.state) {
      case 'work':
        // il bosse : pas question d'aller se cacher ni de se promener
        this.touch();
        break;
      case 'binned':
        this.touch();
        break;
      case 'idle':
        this.nextDecision -= dt;
        if (this.wantsToHide()) this.goUp();
        else if (this.nextDecision <= 0 && !this.busy) this.decide();
        this.updateBlink(dt);
        break;
      case 'walk':
        if (this.move === 'walk') this.updateWalk(dt);
        else this.updateHop(dt);
        break;
      case 'laugh':
        if (this.t > FRAME * BOUNCE.heights.length) this.speakPending();
        break;
      case 'alert':
        if (this.t > 1.3) this.speakPending();
        break;
      case 'happy':
        if (this.t > 1.6) this.toIdle();
        break;
      case 'talk':
        if (!this.bubble.visible) this.toIdle();
        break;
      case 'drag':
        this.updateRig(dt);
        break;
      case 'fly':
        this.updateFlight(dt);
        break;
      case 'listen':
      case 'think':
        // on discute : pas question d'aller se cacher
        this.touch();
        this.updateBlink(dt);
        break;
      case 'crouch':
        if (this.t > 0.12) {
          this.setState('jump');
          // gravité réglée pour monter en JUMP.duration, et arriver en haut presque à l'arrêt
          const h = this.ground + 8 * this.scale;
          this.jumpGravity = (2 * h) / JUMP.duration ** 2;
          this.vy = -Math.sqrt(2 * this.jumpGravity * h + JUMP.arrive ** 2);
          sfx.jump();
        }
        break;
      case 'jump':
        this.vy = Math.min(this.vy + this.jumpGravity * dt, -JUMP.arrive);
        this.y += this.vy * dt;
        if (this.y <= 0 || this.vy >= 0) {
          this.setState('hidden');
          this.tail.drop = 0;
          this.onPositionChange(this.x);
        }
        break;
      case 'hidden':
        this.tail.drop = Math.min(this.tail.drop + dt / 0.45, 1);
        this.tail.wiggle = Math.max(this.tail.wiggle - dt, 0);
        this.tail.twitchIn -= dt;
        if (this.tail.twitchIn <= 0) {
          this.tail.wiggle = 0.6;
          this.tail.twitchIn = 6 + Math.random() * 10;
        }
        break;
      case 'fall':
        this.vy += GRAVITY * dt;
        this.y = Math.min(this.y + this.vy * dt, this.ground);
        if (this.y >= this.ground) {
          this.setState('land');
          if (!this.silentLanding) sfx.thud();
          this.silentLanding = false;
        }
        break;
      case 'leap': {
        const l = this.leap;
        if (!l) { this.toIdle(); break; }
        l.t += dt;
        const p = Math.min(l.t / l.duration, 1);
        // une courbe de Bézier : départ, un point au-dessus du plus haut des deux, arrivée
        const top = Math.min(l.fromY, l.toY) - (l.lift ?? LEAP.arc * this.scale * 2);
        // `ease` : de côté, il attend d'être au-dessus (sortie) ou arrive d'abord au-dessus (entrée) de la benne
        const px = l.ease === 'in' ? p ** 3 : l.ease === 'out' ? 1 - (1 - p) ** 3 : p;
        this.x = l.fromX + (l.toX - l.fromX) * px;
        this.y = (1 - p) ** 2 * l.fromY + 2 * (1 - p) * p * top + p ** 2 * l.toY;
        if (p >= 1) {
          this.leap = null;
          this.y = l.toY;
          this.onPositionChange(this.x);
          sfx.thud();
          if (l.resume) {
            this.setState(l.resume);
            // ce qui attendait la fin du bond (une réplique, une session qui commence…)
            const next = this.afterLand;
            this.afterLand = null;
            next?.();
          } else this.setState('land');
        }
        break;
      }
      case 'land':
        if (this.t > FRAME * 2.5) {
          const next = this.afterLand;
          this.afterLand = null;
          if (next) { this.toIdle(); next(); } else this.speakPending();
        }
        break;
    }

  }

  private updateWalk(dt: number) {
    const d = this.targetX - this.x;
    if (Math.abs(d) < 1) {
      this.x = this.targetX;
      this.onPositionChange(this.x);
      this.toIdle();
      return;
    }
    this.dir = d > 0 ? 1 : -1;
    this.x += this.dir * Math.min(Math.abs(d), WALK.speed * this.scale * dt);
  }

  /** Un bond (8 frames : appel, vol, réception) ; on enchaîne jusqu'à la cible */
  private updateHop(dt: number) {
    if (this.hopT === 0) {
      const d = this.targetX - this.x;
      this.dir = d > 0 ? 1 : -1;
      this.hopFrom = this.x;
      this.hopTo = this.x + this.dir * Math.min(Math.abs(d), HOP.distance * this.scale);
      this.hopCrouch = this.hopChain ? HOP.ground : HOP.frame;
      this.hopLand = Math.abs(this.targetX - this.hopTo) >= 1 ? HOP.ground : HOP.frame;
    }
    this.hopT += dt;
    // l'élan : un peu d'avance pendant l'appel enchaîné et la réception, le reste en vol
    const chainIn = this.hopChain ? HOP.glide : 0, chainOut = this.hopLand < HOP.frame ? HOP.glide : 0;
    const air = this.hopAir();
    const crouch = Math.min(this.hopT / this.hopCrouch, 1);
    const land = Math.min(Math.max((this.hopT - this.hopCrouch - HOP.frame * 6) / this.hopLand, 0), 1);
    const part = chainIn * crouch + (1 - chainIn - chainOut) * air + chainOut * land;
    this.x = this.hopFrom + (this.hopTo - this.hopFrom) * part;
    if (this.hopT >= this.hopCrouch + HOP.frame * 6 + this.hopLand) {
      this.hopT = 0;
      this.x = this.hopTo;
      this.hopChain = Math.abs(this.targetX - this.x) >= 1;
      if (!this.hopChain) {
        this.onPositionChange(this.x);
        this.toIdle();
      }
    }
  }

  /** Avancement du vol pendant un bond : de 0 (fin de l'appel) à 1 (réception) */
  private hopAir() {
    return Math.min(Math.max((this.hopT - this.hopCrouch) / (HOP.frame * 6), 0), 1);
  }

  /** La frame du bond : appel (0), vol (1 à 6), réception (7) */
  private hopFrame() {
    if (this.hopT < this.hopCrouch) return 0;
    const air = this.hopAir();
    return air < 1 ? 1 + Math.min(Math.floor(air * 6), 5) : 7;
  }

  private wantsToHide() {
    // assis sur sa fenêtre, on s'occupe de lui : il ne va pas se cacher
    if (this.busy || this.perch || this.settings.hideAfterSec <= 0) return false;
    return Date.now() - this.lastInteraction > this.hideDelay * 1000;
  }

  private decide() {
    const r = Math.random();
    const margin = this.size / 2 + 12;
    // sur sa fenêtre, il ne se promène que sur son bord
    const lo = this.perch ? this.perch.x0 + margin : margin, hi = this.perch ? this.perch.x1 - margin : innerWidth - margin;
    if (r < 0.4 && hi - lo > 60) {
      let tx = lo + Math.random() * (hi - lo);
      if (Math.abs(tx - this.x) < 80) tx = this.x + (tx > this.x ? 120 : -120);
      this.targetX = Math.min(Math.max(tx, lo), hi);
      // il marche pour les petits trajets, et bondit plutôt pour traverser l'écran
      this.move = Math.abs(this.targetX - this.x) > 250 && Math.random() < 0.6 ? 'hop' : 'walk';
      this.hopT = 0;
      this.hopChain = false;
      this.setState('walk');
    } else if (r < 0.5) {
      this.setState('happy');
    }
    this.nextDecision = 3 + Math.random() * 7;
  }

  private updateBlink(dt: number) {
    if (this.blink.left > 0) {
      this.blink.left -= dt;
    } else {
      this.blink.wait -= dt;
      if (this.blink.wait <= 0) {
        this.blink.left = 0.12;
        this.blink.wait = 2 + Math.random() * 4;
      }
    }
  }

  private frame(): FrameName {
    const t = this.t;
    const alt = (period: number) => Math.floor(t / period) % 2 === 1;
    switch (this.state) {
      case 'work': {
        // des salves de frappe, puis il relit son écran
        const cycle = t % 2.4;
        if (cycle > 1.4) return 'work0';
        return Math.floor(t / 0.14) % 2 ? 'work1' : 'work2';
      }
      case 'idle': {
        if (this.blink.left > 0) return 'blink';
        // la queue remue par petites salves, pas en continu
        if (t % 6 > 1.6) return 'idle0';
        return (['idle0', 'idle1', 'idle0', 'idle2'] as const)[Math.floor(t / (FRAME * 2)) % 4];
      }
      case 'walk':
        return this.move === 'walk'
          ? seq('walk', Math.floor(t / WALK.frame) % WALK.frames)
          : seq('hop', this.hopFrame());
      case 'talk': return this.mouth === 2 ? 'talk1' : this.mouth === 1 ? 'talk0' : 'idle0';
      case 'laugh': return seq('bounce', BOUNCE.first + Math.min(Math.floor(t / FRAME), BOUNCE.heights.length - 1));
      case 'alert': return alt(FRAME * 2) ? 'alert1' : 'alert0';
      case 'happy': return 'happy';
      case 'listen': return this.blink.left > 0 ? 'blink' : 'idle0';
      case 'think': return this.blink.left > 0 ? 'blink' : 'think';
      case 'drag':
      case 'fly': return seq('gbody', Math.floor(t / FRAME) % 12);
      case 'crouch': return 'leap1';
      case 'binned': return 'idle0';
      // le bond vers sa fenêtre : l'appel, le vol, puis il tend les pattes pour se poser
      case 'leap': return seq('hop', this.leap ? 1 + Math.min(Math.floor((this.leap.t / this.leap.duration) * 6), 5) : 0);
      // l'envol est le seul mouvement plus rapide : bras qui se lèvent, puis tout tendu vers le haut
      // les frames suivent la hauteur atteinte : bras tendus au départ, regroupé en arrivant
      case 'jump': return seq('leap', Math.min(2 + Math.floor((1 - this.y / this.ground) * 4), 5));
      // chute tête en bas, la queue qui fouette
      case 'fall': return seq('fall', Math.floor(t / FRAME) % 5);
      // réception : le choc, puis écrasé ; il se rassoit ensuite dans la pose de référence
      case 'land': return t < FRAME ? 'fall5' : 'fall6';
      case 'pull': return 'pulled';
      case 'hidden': {
        const period = this.tail.wiggle > 0 ? 0.12 : 0.8;
        return (['hang0', 'hang1', 'hang0', 'hang2'] as const)[Math.floor(t / period) % 4];
      }
    }
  }

  /** Petit saut (en px, vers le haut) pour certaines réactions */
  private hop() {
    const s = this.scale;
    if (this.state === 'laugh') {
      const i = Math.min(Math.floor(this.t / FRAME), BOUNCE.heights.length - 1);
      return BOUNCE.heights[i] * s;
    }
    if (this.state === 'alert' && this.t < 0.6) return Math.abs(Math.sin((this.t / 0.3) * Math.PI)) * 4 * s;
    if (this.state === 'walk' && this.move === 'hop') {
      const air = this.hopAir();
      if (air > 0 && air < 1) return Math.sin(air * Math.PI) * HOP.height * s;
    }
    return 0;
  }

  private rect() {
    const s = this.scale;
    const left = Math.round(this.x / s) * s - this.size / 2;
    if (this.onCeiling) {
      // la queue descend du haut de l'écran avec un petit rebond
      const d = this.tail.drop;
      const ease = 1 + 2.2 * Math.pow(d - 1, 3) + 1.2 * Math.pow(d - 1, 2);
      const top = -HANG_LENGTH * s * (1 - ease) + this.tail.pull;
      return { left, top: Math.round(top / s) * s };
    }
    const top = Math.round((this.y - this.hop()) / s) * s - this.size;
    return { left, top };
  }

  /** Dessine Gilbert (et sa poubelle), et renvoie la zone touchée (pour l'effacer à la frame suivante) */
  draw(ctx: CanvasRenderingContext2D) {
    const bin = this.bin ? this.drawBin(ctx) : null;
    let pet = null;
    if (this.state !== 'binned') {
      if (this.bin?.front) {
        // dans la benne : on ne voit que ce qui dépasse au-dessus de son bord avant
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, innerWidth, this.bin.box.rim);
        ctx.clip();
        pet = this.drawPet(ctx);
        ctx.restore();
      } else pet = this.drawPet(ctx);
    }
    const zones = [bin, pet].filter((z): z is { x: number; y: number; w: number; h: number } => Boolean(z));
    if (!zones.length) return { x: 0, y: 0, w: 0, h: 0 };
    const x = Math.min(...zones.map((z) => z.x)), y = Math.min(...zones.map((z) => z.y));
    return { x, y, w: Math.max(...zones.map((z) => z.x + z.w)) - x, h: Math.max(...zones.map((z) => z.y + z.h)) - y };
  }

  private drawPet(ctx: CanvasRenderingContext2D) {
    const s = this.scale;
    const { left, top } = this.rect();

    if (this.onCeiling) {
      drawFrame(ctx, this.frame(), left, top, s, false);
      this.bubble.place(left + this.size / 2, top + HANG_LENGTH * s, true);
      return { x: left - 2 * s, y: 0, w: this.size + 4 * s, h: Math.max(top, 0) + this.size + 2 * s };
    }

    if (this.state === 'drag' || this.state === 'fly') return this.drawRig(ctx);

    const flip = this.flip;
    // ombre au sol, plus petite quand Gilbert est en l'air (pas pendant un bond vers sa fenêtre :
    // le sol change en route)
    const shadow = this.state !== 'leap';
    if (shadow) {
      const air = Math.min((this.ground - this.y + this.hop()) / 300, 1);
      const cx = Math.round(this.x / s) * s;
      const sw = Math.round(18 - air * 10) * s;
      ctx.fillStyle = 'rgba(20, 25, 31, 0.22)';
      ctx.fillRect(cx - sw / 2, this.ground - 2 * s, sw, s);
      ctx.fillRect(cx - sw / 2 + s, this.ground - s, sw - 2 * s, s);
    }

    const frame = this.frame();
    drawFrame(ctx, frame, left, top, s, flip);
    if (this.drop) drawGrid(ctx, this.drop.grid, Math.round(this.drop.x / s) * s, Math.round(this.drop.y / s) * s, s);

    const headX = flip ? SIZE - 1 - HEAD_CENTER : HEAD_CENTER;
    if (this.state === 'alert') {
      const bounce = Math.floor(this.t / 0.2) % 2 ? s : 0;
      drawGlyph(ctx, '!', left + (headX + (flip ? -10 : 9)) * s, top + (HEAD_TOP - 6) * s - bounce, s, '#e8743b');
    }

    this.anchor = { x: left + headX * s, y: top + HEAD_TOP * s };
    this.bubble.place(this.anchor.x, this.anchor.y);

    // la zone à effacer à la frame suivante : le sprite, le « ! » au-dessus, l'ombre et le gland
    // tombé en dessous (le sol peut être au-dessus de lui pendant un bond : on prend le plus bas)
    const y = top - 26 * s;
    const bottom = Math.max(top + this.size, shadow ? this.ground : 0, this.drop ? this.drop.y + 12 * s : 0) + 4 * s;
    return { x: left - 8 * s, y, w: this.size + 22 * s, h: bottom - y };
  }

  /** Le pointeur est-il sur un pixel opaque de Gilbert (ou de sa queue) ? */
  hit(mx: number, my: number) {
    if (this.state === 'jump' || this.state === 'crouch' || this.state === 'leap' || this.state === 'binned') return false;
    // en vol, on peut le rattraper au vol
    if (this.state === 'fly' && this.flight) {
      return Math.hypot(mx - this.flight.x, my - this.flight.y) < GRAB.bodyHeight * 0.6 * this.scale;
    }
    const s = this.scale;
    const { left, top } = this.rect();
    const px = Math.floor((mx - left) / s), py = Math.floor((my - top) / s);
    // une petite tolérance d'un pixel autour du sprite
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (isOpaque(this.frame(), px + dx, py + dy, this.flip)) return true;
    }
    return false;
  }

  // ---------- souris ----------

  pointerDown(mx: number, my: number) {
    if (!this.hit(mx, my)) return false;
    this.press = { x: mx, y: my, tail: this.onCeiling };
    return true;
  }

  pointerMove(mx: number, my: number) {
    const press = this.press;
    if (!press) return;
    // en plein travail, on ne l'emporte pas
    if (this.working) return;

    if (press.tail) {
      const s = this.scale;
      const dy = my - press.y;
      if (dy > PULL_DISTANCE * s) {
        // il lâche prise et tombe
        this.press = null;
        this.tail.pull = 0;
        this.bubble.hide();
        sfx.whistle();
        this.onPulledDown?.();
        this.comeDown(this.quiet ? null : pick(lines.pulled));
      } else if (dy > 2) {
        if (this.state !== 'pull') sfx.squeak();
        this.setState('pull');
        this.tail.pull = Math.min(dy * 0.5, 5 * s);
      } else if (this.state === 'pull') {
        this.setState('hidden');
        this.tail.pull = 0;
      }
      return;
    }

    if (!this.dragging_ && Math.hypot(mx - press.x, my - press.y) > 5) {
      // attrapé : il se retrouve pendu par la queue (et quitte sa fenêtre s'il y était assis)
      this.dragging_ = true;
      this.perch = null;
      // sa poubelle (son icône du bureau, ou en bas à gauche) : on peut l'y lâcher pour quitter
      if (!this.bin && !this.homeHidden) this.newBin('standby');
      this.onGrab?.();
      this.bubble.hide();
      this.pending = null;
        this.setState('drag');
      sfx.pop();
    }
    if (this.dragging_) {
      // le bout de la queue suit le curseur ; le reste suit par la physique
      if (!this.rig) this.startRig(mx, my);
      this.rig!.p0 = { x: mx, y: my };
    }
  }

  pointerUp() {
    const press = this.press;
    if (!press) return;
    this.press = null;
    if (this.working) {
      this.onWorkClick?.();
      return;
    }

    if (press.tail) {
      if (this.state === 'pull') {
        // tiré mais pas assez fort : la queue remonte en gigotant
        this.setState('hidden');
        this.tail.pull = 0;
        this.tail.wiggle = 0.8;
        sfx.squeak();
        return;
      }
      // un simple clic sur la queue : il descend, comme si on avait cliqué sur lui
      sfx.whistle();
      this.afterLand = () => { this.clicked(); };
      this.comeDown(null);
      return;
    }
    if (this.dragging_) {
      this.dragging_ = false;
      if (this.overBin()) {
        // lâché dans sa poubelle : au revoir
        this.rig = null;
        this.trail = [];
        this.setState('idle');
        this.jumpInto();
        return;
      }
      this.release();
      this.touch();
    } else if (this.state !== 'fly') {
      this.clicked();
    }
  }

  /** Compte un clic sur Gilbert ; renvoie le nombre de clics des 4 dernières secondes */
  registerClick() {
    const now = Date.now();
    this.clicks = this.clicks.filter((c) => now - c < 4000).concat(now);
    return this.clicks.length;
  }

  private clicked() {
    this.touch();
    const n = this.registerClick();
    if (this.quiet) {
      this.say(pick(lines.quietClick));
      return;
    }
    // clics à répétition : il ne rouvre pas la discussion, il réagit… et finit par râler
    if (n < 3 && this.clickHandler?.()) return;
    this.setState('laugh');
    sfx.hop();
    this.onPlay?.('click');
    // de mauvaise humeur, il répond plus sec (une fois sur deux)
    this.pending = n >= 5 ? pick(lines.annoyed) : this.mood < 0.3 && Math.random() < 0.5 ? pick(lines.sulkyClick) : pick(lines.click);
  }

  // ---------- événements ----------

  say(text: string, actions?: SayOptions['actions'], onDone?: () => void) {
    // en plein travail, il reste à son ordinateur : juste la bulle
    if (this.working) return this.whisper(text, actions, onDone);
    if (this.afterLeap(() => this.say(text, actions, onDone))) return;
    if (this.onCeiling || this.state === 'crouch' || this.state === 'jump') {
      this.afterLand = () => this.say(text, actions, onDone);
      this.comeDown(null);
      return;
    }
    if (this.dragging || this.state === 'fall' || this.state === 'fly') return;
    this.touch();
    this.setState('talk');
    const silent = this.quiet;
    const speech = this.speech(silent);
    this.bubble.say(text, {
      ...speech,
      actions,
      onDone: () => { speech.onDone?.(); onDone?.(); },
    });
  }

  /** Bouche qui bouge et voix pixel, lettre par lettre */
  private speech(silent: boolean): SayOptions {
    return {
      onChar: (ch) => {
        this.mouth = VOWEL.test(ch) ? 2 : /[\p{L}\p{N}]/u.test(ch) ? 1 : 0;
        if (!silent) voice(ch);
      },
      onDone: () => { this.mouth = 0; },
    };
  }

  /**
   * Une bulle discrète : il ne bouge pas (reste caché en haut, ou continue de travailler), sans
   * voix ni animation. Pour les petites aides, et le temps restant d'une session.
   */
  whisper(text: string, actions?: SayOptions['actions'], onDone?: () => void, long = false) {
    if (this.dragging || this.state === 'fall' || this.state === 'fly' || this.state === 'jump') return;
    this.bubble.say(text, { actions, onDone, long });
  }

  /** Petits points discrets (il réfléchit sans bouger), avant une bulle discrète */
  whisperThinking() {
    if (this.dragging || this.state === 'fall' || this.state === 'fly' || this.state === 'jump') return;
    this.bubble.think();
  }

  /** Fait `then` tout de suite, ou une fois descendu s'il est caché en haut de l'écran */
  call(then: () => void) {
    if (this.onCeiling || this.state === 'crouch' || this.state === 'jump') {
      this.afterLand = then;
      this.comeDown(null, true);
    } else then();
  }

  /** Session de travail : il s'installe à son ordinateur jusqu'à `endsAt` */
  startWork(endsAt: number) {
    if (this.afterLeap(() => this.startWork(endsAt))) return;
    if (this.onCeiling || this.state === 'crouch' || this.state === 'jump') {
      this.afterLand = () => this.startWork(endsAt);
      this.comeDown(null, true);
      return;
    }
    this.focusEnds = endsAt;
    this.bubble.hide();
    this.pending = null;
    this.setState('work');
  }

  /** Fin de session : content, et un gland (ou un gland doré) qui tombe à côté de lui */
  endWork(acorn: string[] | null) {
    this.focusEnds = 0;
    if (!this.working) return;
    if (!acorn) {
      this.toIdle();
      return;
    }
    const s = this.scale;
    this.setState('happy');
    sfx.hop();
    const { left, top } = this.rect();
    this.drop = { grid: acorn, x: left + this.size - 6 * s, y: top + (HEAD_TOP + 8) * s, vy: -260, until: Date.now() + 9000 };
  }

  /** Le champ de discussion est ouvert : Gilbert t'écoute */
  listen() {
    if (this.afterLeap(() => this.listen())) return;
    this.bubble.hide();
    this.pending = null;
    this.setState('listen');
  }

  /** La question est partie : il réfléchit (petits points) */
  think() {
    if (this.afterLeap(() => this.think())) return;
    this.setState('think');
    this.bubble.think();
  }

  /** Fin d'une réflexion qui n'a pas donné de réponse en bulle (le brief arrive par ailleurs) */
  stopThinking() {
    if (this.state !== 'think') return;
    this.bubble.hide();
    this.toIdle();
  }

  /** Début de la réponse du cerveau : renvoie de quoi l'alimenter au fil de l'eau */
  answer(): Stream {
    this.setState('talk');
    return this.bubble.stream(this.speech(this.quiet));
  }

  /** Discussion fermée sans rien envoyer */
  stopListening() {
    if (this.state === 'listen') this.toIdle();
  }

  alert(text: string, actions?: SayOptions['actions']) {
    if (this.working) return this.whisper(text, actions);
    if (this.afterLeap(() => this.alert(text, actions))) return;
    if (this.onCeiling || this.state === 'crouch' || this.state === 'jump') {
      this.afterLand = () => this.alert(text, actions);
      this.comeDown(null);
      return;
    }
    if (this.dragging) return;
    this.touch();
    this.bubble.hide();
    this.setState('alert');
    if (!this.quiet) sfx.alert();
    this.pending = text;
    this.pendingActions = actions;
  }

  /**
   * Sa fenêtre s'ouvre (`at` : son bord du haut, en px de l'écran de Gilbert) : il saute s'y asseoir.
   * Elle se ferme (`at` null) : il redescend d'un bond, et reprend ce qu'il faisait (écouter, réfléchir).
   */
  setPerch(at: { x: number; y: number; width: number } | null) {
    const margin = this.size / 2 + 4;
    if (at) {
      const perch = { x0: at.x, x1: at.x + at.width, y: at.y };
      const tx = Math.min(Math.max(this.x, perch.x0 + margin), perch.x1 - margin);
      // en plein travail, attrapé ou en vol : il reste où il est
      if (this.working || ['drag', 'fly', 'fall', 'crouch', 'jump', 'leap', 'listen', 'think'].includes(this.state)) return;
      this.perch = perch;
      if (this.onCeiling) {
        // caché en haut : il se laisse tomber droit dessus
        this.x = tx;
        this.comeDown(null, true);
        return;
      }
      this.bubble.hide();
      this.pending = null;
      this.jumpTo(tx, perch.y, null);
      return;
    }
    if (!this.perch) return;
    this.perch = null;
    // caché en haut, attrapé, en vol ou déjà en chute : il retombera tout seul jusqu'en bas
    if (this.onCeiling || ['drag', 'fly', 'fall', 'crouch', 'jump'].includes(this.state)) return;
    if (this.state === 'leap' && this.leap) {
      // il n'était pas encore arrivé : il change de cap et redescend
      this.jumpTo(this.x, innerHeight, this.leap.resume);
      return;
    }
    // il reprend ensuite ce qu'il faisait : écouter, réfléchir, parler, travailler
    const resume = (['listen', 'think', 'talk', 'work'] as State[]).includes(this.state) ? this.state : null;
    this.jumpTo(Math.min(Math.max(this.x, margin), innerWidth - margin), innerHeight, resume);
  }

  /** En plein bond : `then` attend qu'il soit posé (sinon il resterait figé en l'air) */
  private afterLeap(then: () => void) {
    if (this.state !== 'leap' && this.state !== 'binned') return false;
    this.afterLand = then;
    return true;
  }

  /**
   * On essaie quelque chose depuis sa fenêtre (`x0` à `x1`) : il en saute et se pose au sol à côté,
   * assez loin pour que sa bulle (jusqu'à 420 px de large) ne passe pas sous la fenêtre.
   */
  stepAside(x0: number, x1: number) {
    const margin = this.size / 2 + 4, clear = 230;
    const sides = [x0 - clear, x1 + clear].filter((x) => x >= margin && x <= innerWidth - margin);
    const x = sides.length
      ? sides.sort((a, b) => Math.abs(a - this.x) - Math.abs(b - this.x))[0]
      : (x0 > innerWidth - x1 ? margin : innerWidth - margin);
    this.perch = null;
    if (this.onCeiling || this.working || ['drag', 'fly', 'fall', 'crouch', 'jump', 'binned'].includes(this.state)) return;
    if (this.state === 'leap' && this.leap) return this.jumpTo(x, innerHeight, this.leap.resume);
    const resume = (['listen', 'think', 'talk'] as State[]).includes(this.state) ? this.state : null;
    this.jumpTo(x, innerHeight, resume);
  }

  private jumpTo(x: number, y: number, resume: State | null) {
    const distance = Math.hypot(x - this.x, y - this.y);
    this.leap = { fromX: this.x, fromY: this.y, toX: x, toY: y, t: 0, duration: LEAP.base + distance * LEAP.perPx, resume };
    if (x !== this.x) this.dir = x > this.x ? 1 : -1;
    this.setState('leap');
    sfx.jump();
  }

  /** Saute se cacher au-dessus du haut de l'écran */
  goUp() {
    const onGround = ['idle', 'walk', 'happy', 'talk', 'laugh'].includes(this.state);
    if (!onGround) return;
    this.bubble.hide();
    this.pending = null;
    this.setState('crouch');
  }

  /** Redescend (tombe du haut de l'écran), avec éventuellement une réplique à l'arrivée */
  comeDown(line: string | null = pick(lines.comeDown), silent = false) {
    if (this.state === 'crouch') {
      // il n'avait pas encore sauté : il reste au sol
      const next = this.afterLand;
      this.afterLand = null;
      this.toIdle();
      if (next) next();
      else if (line) this.say(line);
      return;
    }
    if (!this.onCeiling && this.state !== 'jump') return;
    if (this.state !== 'jump') this.y = 0;
    this.press = null;
    this.tail.pull = 0;
    this.vy = 0;
    this.pending = line;
    this.silentLanding = silent;
    this.touch();
    this.setState('fall');
  }

  /** Durée d'inactivité de l'utilisateur, envoyée régulièrement par le process principal */
  userIdle(seconds: number) {
    const wasAway = this.userAway;
    this.userAway = seconds >= AWAY_AFTER;
    // tu reviens : la queue s'agite pour dire bonjour
    if (wasAway && !this.userAway && this.onCeiling) this.tail.wiggle = 2.5;
  }

  isIdle() {
    return this.state === 'idle' && !this.busy;
  }

  resize() {
    if (!this.onCeiling && !this.airborne && this.state !== 'drag') this.y = this.ground;
    this.clampX();
    if (this.state === 'walk') this.targetX = Math.min(Math.max(this.targetX, this.size / 2), innerWidth - this.size / 2);
  }

  // ---------- tenu par la queue, puis lancé ----------

  private lengths() {
    const s = this.scale;
    return { tail: (GRAB.tailBase[1] - GRAB.tailTip[1]) * s, body: GRAB.bodyHeight * 0.5 * s };
  }

  private startRig(mx: number, my: number) {
    const { tail, body } = this.lengths();
    // rattrapé en vol : on garde un peu de son élan
    const f = this.flight;
    const p1 = { x: mx, y: my + tail }, p2 = { x: mx, y: my + tail + body };
    const q2 = f ? { x: p2.x - f.vx * RIG.step * 0.5, y: p2.y - f.vy * RIG.step * 0.5 } : { ...p2 };
    this.flight = null;
    this.rig = { p0: { x: mx, y: my }, p1, p2, q1: { ...p1 }, q2, a2: 0, spin: 0, acc: 0, time: 0, turn: 0 };
    this.trail = [];
  }

  private updateRig(dt: number) {
    const r = this.rig;
    if (!r) return;
    const { tail, body } = this.lengths();
    const h = RIG.step;
    r.acc += dt;
    while (r.acc >= h) {
      r.acc -= h;
      for (const [p, q] of [[r.p1, r.q1], [r.p2, r.q2]] as const) {
        const vx = (p.x - q.x) * RIG.damping, vy = (p.y - q.y) * RIG.damping;
        q.x = p.x; q.y = p.y;
        p.x += vx;
        p.y += vy + RIG.gravity * h * h;
      }
      for (let k = 0; k < RIG.iterations; k++) {
        // queue : longueur fixe depuis le curseur
        const a1 = Math.atan2(r.p1.x - r.p0.x, r.p1.y - r.p0.y);
        r.p1.x = r.p0.x + Math.sin(a1) * tail;
        r.p1.y = r.p0.y + Math.cos(a1) * tail;
        // corps : longueur fixe depuis la base de la queue, pliure limitée
        let a2 = Math.atan2(r.p2.x - r.p1.x, r.p2.y - r.p1.y);
        const bend = wrap(a2 - a1);
        if (Math.abs(bend) > RIG.maxBend) a2 = a1 + Math.sign(bend) * RIG.maxBend;
        r.p2.x = r.p1.x + Math.sin(a2) * body;
        r.p2.y = r.p1.y + Math.cos(a2) * body;
        // il ne traverse ni le sol ni les bords
        r.p2.y = Math.min(r.p2.y, this.ground - body * 0.4);
        r.p2.x = Math.min(Math.max(r.p2.x, body), innerWidth - body);
      }
      const a2 = Math.atan2(r.p2.x - r.p1.x, r.p2.y - r.p1.y);
      const turned = wrap(a2 - r.a2);
      r.spin = turned / h;
      r.turn += turned;
      r.a2 = a2;
      r.time += h;
      this.trail.push({ x: r.p2.x, y: r.p2.y, turn: r.turn, t: r.time });
      while (this.trail.length > 2 && r.time - this.trail[0].t > THROW.twirlWindow) this.trail.shift();
    }
    this.x = r.p2.x;
    this.y = Math.min(r.p2.y + body, this.ground);
  }

  /** Lâché : il part avec la vitesse et la rotation qu'il avait au bout de la queue */
  private release() {
    this.onPlay?.('throw');
    const r = this.rig;
    this.rig = null;
    if (!r) { this.setState('fall'); return; }
    // vitesse et rotation du corps, moyennées sur ses dernières positions
    const last = this.trail[this.trail.length - 1];
    const first = this.trail.find((p) => last.t - p.t <= THROW.window) ?? last;
    const span = last ? last.t - first.t : 0;
    const twirling = last && Math.abs(last.turn - this.trail[0].turn) > THROW.twirl;
    this.trail = [];
    let vx = span > 0 ? (last.x - first.x) / span : 0;
    let vy = span > 0 ? (last.y - first.y) / span : 0;
    const turning = span > 0 ? ((last.turn - first.turn) / span) * (twirling ? 1 : THROW.flickSpin) : 0;
    const speed = Math.hypot(vx, vy);
    if (speed > FLY.maxSpeed) { vx *= FLY.maxSpeed / speed; vy *= FLY.maxSpeed / speed; }
    const spin = Math.max(-FLY.maxSpin, Math.min(FLY.maxSpin, turning));
    this.flight = { x: r.p2.x, y: r.p2.y, vx, vy, angle: r.a2, spin, peak: r.p2.y };
    this.setState('fly');
  }

  private updateFlight(dt: number) {
    const f = this.flight;
    if (!f) return;
    const { body } = this.lengths();
    f.vy += FLY.gravity * dt;
    f.vx *= 1 - FLY.drag * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    const off = wrap(Math.atan2(f.vx, f.vy) - f.angle);
    f.spin += (off * FLY.align * dt) / (1 + Math.abs(f.spin) / 3);
    f.spin *= 1 - FLY.spinDrag * dt;
    f.angle += f.spin * dt;
    f.peak = Math.min(f.peak, f.y);
    // rebonds sur les bords de l'écran et au plafond
    if (f.x < body) { f.x = body; f.vx = Math.abs(f.vx) * FLY.bounce; f.spin *= -0.4; sfx.squeak(); }
    if (f.x > innerWidth - body) { f.x = innerWidth - body; f.vx = -Math.abs(f.vx) * FLY.bounce; f.spin *= -0.4; sfx.squeak(); }
    if (f.y < body) { f.y = body; f.vy = Math.abs(f.vy) * FLY.bounce; }
    this.x = f.x;
    this.y = Math.min(f.y + body, this.ground);
    if (f.y + body * 0.9 >= this.ground) {
      // réception : il se remet d'aplomb en touchant le sol
      const height = this.ground - f.peak, impact = f.vy;
      this.flight = null;
      this.x = Math.min(Math.max(f.x, this.size / 2), innerWidth - this.size / 2);
      this.y = this.ground;
      this.setState('land');
      sfx.thud();
      if (!this.quiet && (height > 260 || impact > 1700)) this.pending = pick(lines.dropHigh);
      else if (!this.quiet && Math.random() < 0.3) this.pending = pick(lines.grabbed);
      this.onPositionChange(this.x);
    }
  }

  /** Les deux morceaux : la queue (pivot au bout) et le corps (pivot à la base de la queue) */
  private drawRig(ctx: CanvasRenderingContext2D) {
    const s = this.scale;
    const { tail, body } = this.lengths();
    let tip: V, joint: V, aTail: number, aBody: number;
    if (this.rig) {
      const r = this.rig;
      tip = r.p0; joint = r.p1;
      aTail = Math.atan2(r.p1.x - r.p0.x, r.p1.y - r.p0.y);
      aBody = Math.atan2(r.p2.x - r.p1.x, r.p2.y - r.p1.y);
    } else {
      // en vol : la queue et le corps restent alignés, l'ensemble tourne autour du corps
      const f = this.flight!;
      aTail = aBody = f.angle;
      joint = { x: f.x - Math.sin(f.angle) * body, y: f.y - Math.cos(f.angle) * body };
      tip = { x: joint.x - Math.sin(f.angle) * tail, y: joint.y - Math.cos(f.angle) * tail };
    }
    const q = (a: number) => -Math.round(a / ANGLE_STEP) * ANGLE_STEP;

    // ombre au sol, sous le corps
    const air = Math.min((this.ground - this.y) / 300, 1);
    const sw = Math.round(16 - air * 10) * s;
    ctx.fillStyle = 'rgba(20, 25, 31, 0.22)';
    ctx.fillRect(Math.round(this.x / s) * s - sw / 2, this.ground - 2 * s, sw, s);

    drawFrameRotated(ctx, this.frame(), joint.x, joint.y, GRAB.bodyJoint[0], GRAB.bodyJoint[1], s, q(aBody));
    drawFrameRotated(ctx, 'gtail', tip.x, tip.y, GRAB.tailTip[0], GRAB.tailTip[1], s, q(aTail));

    const reach = tail + body * 2 + 4 * s;
    const cx = (tip.x + joint.x) / 2, cy = (tip.y + joint.y) / 2;
    return { x: cx - reach - 8 * s, y: cy - reach - 8 * s, w: 2 * reach + 16 * s, h: Math.max(2 * reach + 16 * s, this.ground - (cy - reach) + 8 * s) };
  }

  // ---------- sa poubelle ----------

  /** Où se trouve sa poubelle : son icône du bureau, ou une qu'il dessine en bas à gauche de l'écran */
  private spot(): DumpBox {
    const h = this.home;
    if (h) return dumpBox(h.x, h.y - h.size / 2, h.size);
    const size = 36 * this.scale;
    return dumpBox(16 * this.scale + size / 2, innerHeight - DUMP.bottom * size, size);
  }

  /** La place de son icône du bureau, relue (elle a pu être déplacée) ; la poubelle qui attend suit */
  setHome(home: Home | null) {
    this.home = home;
    const b = this.bin;
    if (b?.mode !== 'standby') return;
    // son icône est cachée par des fenêtres : pas de poubelle à montrer (elle flotterait au-dessus)
    if (home && !home.visible) this.bin = null;
    else b.box = this.spot();
  }

  /** Sa poubelle du bureau est cachée par d'autres fenêtres : elle ne se montre pas et ne sert pas */
  private get homeHidden() {
    return Boolean(this.home && !this.home.visible);
  }

  private newBin(mode: 'out' | 'standby' | 'in') {
    this.bin = { box: this.spot(), mode, t: 0, alpha: mode === 'standby' ? 0 : 1, popped: false, front: mode === 'out', glow: 0, shake: 0 };
    return this.bin;
  }

  /** Au lancement : il est dans sa poubelle, puis il en sort d'un bond, par-dessus le bord avant */
  emerge(home: Home | null = null) {
    this.home = home;
    if (this.homeHidden) {
      // son icône est sous d'autres fenêtres : pas de poubelle, il tombe simplement du haut de l'écran
      this.y = -this.size;
      this.vy = 0;
      this.silentLanding = false;
      this.setState('fall');
      return;
    }
    this.setState('binned');
    // la benne s'ébranle avant qu'il en jaillisse
    this.newBin('out').shake = BIN.pop + 0.15;
    sfx.rattle();
  }

  /** « Quitter » : il saute dans sa poubelle (son icône du bureau) */
  leave(home: Home | null = this.home) {
    if (this.state === 'binned') return;
    const ground = ['idle', 'walk', 'happy', 'talk', 'laugh', 'alert', 'listen', 'think', 'work', 'land'].includes(this.state);
    if (!ground) return this.onQuit?.();
    this.home = home;
    this.bubble.hide();
    this.pending = null;
    if (this.homeHidden) {
      // pas de poubelle visible : un petit saut d'au revoir, et on quitte
      this.focusEnds = 0;
      this.setState('happy');
      sfx.pop();
      setTimeout(() => this.onQuit?.(), 900);
      return;
    }
    const b = this.newBin('in');
    b.popped = true;
    sfx.pop();
    this.jumpInto();
  }

  /** Il saute dans sa poubelle, bien au-dessous du bord : on ne le voit plus, et on quitte */
  private jumpInto() {
    const b = this.bin;
    if (!b) return;
    b.mode = 'in';
    b.alpha = 1;
    this.perch = null;
    this.focusEnds = 0;
    const to = b.box.rim + this.size * 1.1;
    this.jumpTo(b.box.x, to, 'binned');
    if (this.leap) {
      // une courbe qui passe bien au-dessus du bord (les pieds à 0,9 hauteur de lui au-dessus), pour entrer par le haut
      const f = this.y, m = Math.min(f, to);
      Object.assign(this.leap, { lift: Math.max(0, (f + 2 * m + to - 4 * (b.box.rim - this.size * 0.9)) / 2), ease: 'out' });
    }
    this.afterLand = () => {
      // il retombe au fond : la benne tremble
      sfx.thud();
      sfx.rattle();
      b.shake = BIN.shake;
      setTimeout(() => this.onQuit?.(), BIN.quitAfter * 1000);
    };
  }

  /** Distance entre son corps et le bord de sa poubelle */
  private toBin(b: { box: DumpBox }) {
    return Math.hypot(this.x - b.box.x, this.y - this.size / 4 - b.box.rim);
  }

  /** À partir de quelle distance on peut l'y lâcher */
  private binReach(b: { box: DumpBox }) {
    return Math.max(26 * this.scale, b.box.size * 0.6);
  }

  /** Lâché au-dessus de sa poubelle ? */
  private overBin() {
    const b = this.bin;
    return Boolean(b && b.mode === 'standby' && this.toBin(b) < this.binReach(b));
  }

  private updateBin(dt: number) {
    const b = this.bin;
    if (!b) return;
    b.t += dt;
    b.shake = Math.max(0, b.shake - dt);
    if (b.mode === 'out') {
      if (!b.popped && b.t > BIN.pop) {
        // il jaillit : parti de sous le bord, il monte haut puis retombe sur le sol à côté
        b.popped = true;
        sfx.pop();
        const side = b.box.x > innerWidth / 2 ? -1 : 1, margin = this.size / 2 + 4;
        this.x = b.box.x;
        this.y = b.box.rim + this.size * 1.05;
        this.state = 'idle';
        this.jumpTo(Math.min(Math.max(b.box.x + side * 30 * this.scale, margin), innerWidth - margin), innerHeight, null);
        if (this.leap) Object.assign(this.leap, { lift: this.size * 4.5, ease: 'in' });
      }
      // dès qu'il a les pieds au-dessus du bord, il est dehors
      if (b.popped && b.front && this.y < b.box.rim - 2) b.front = false;
      if (b.t > BIN.gone - 0.6) b.alpha = Math.max(0, (BIN.gone - b.t) / 0.6);
      if (b.t > BIN.gone) this.bin = null;
    } else if (b.mode === 'in') {
      // il est dedans dès que ses pieds passent sous le bord, au-dessus de la benne
      b.front = this.y > b.box.rim - 2 && Math.abs(this.x - b.box.x) < b.box.w / 2 + this.size * 0.2;
    } else {
      // on le tient : elle se montre (si on la dessine), et s'éclaire quand il approche
      const near = this.dragging && this.toBin(b) < this.binReach(b) * 1.8;
      b.glow = Math.min(1, Math.max(0, b.glow + (near ? dt * 6 : -dt * 5)));
      b.alpha = this.dragging ? Math.min(1, b.alpha + dt * 8) : Math.max(0, b.alpha - dt * 3);
      if (!this.dragging && b.alpha <= 0 && b.glow <= 0) this.bin = null;
    }
  }

  /** Dessine sa poubelle (seulement si elle n'est pas déjà là, en icône) et son halo ; renvoie la zone touchée */
  private drawBin(ctx: CanvasRenderingContext2D) {
    const b = this.bin!, x = b.box;
    // sur le bureau, sa vraie icône est dessous : on ne la double que le temps de la secousse
    const art = !this.home || b.shake > 0, halo = b.glow > 0.01;
    if (!art && !halo) return null;
    ctx.save();
    if (art) {
      ctx.globalAlpha = b.alpha;
      ctx.imageSmoothingEnabled = false;
      const dx = b.shake > 0 ? Math.round(Math.sin(b.t * 70) * Math.min(1, b.shake * 4) * Math.max(2, x.size * 0.03)) : 0;
      ctx.drawImage(dumpImg, x.left + dx, x.top, x.w, x.h);
    }
    if (halo) {
      const pulse = 0.75 + 0.25 * Math.sin(b.t * 8);
      ctx.globalAlpha = b.glow * pulse;
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = '#8fd6ff';
      ctx.shadowBlur = 14;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x.left - 6, x.top - 6, x.w + 12, x.h + 12, 12);
      ctx.stroke();
    }
    ctx.restore();
    return { x: x.left - 28, y: x.top - 28, w: x.w + 56, h: x.h + 56 };
  }

  // ---------- utilitaires ----------

  /** Note une interaction : repousse le moment où Gilbert ira se cacher (20 à 30 s par défaut) */
  private touch() {
    this.lastInteraction = Date.now();
    const base = this.settings.hideAfterSec;
    this.hideDelay = base * (0.8 + Math.random() * 0.4);
  }

  private setState(s: State) {
    this.state = s;
    this.t = 0;
  }

  private toIdle() {
    this.setState('idle');
    this.nextDecision = 2 + Math.random() * 5;
  }

  private speakPending() {
    const p = this.pending, actions = this.pendingActions;
    this.pending = null;
    this.pendingActions = undefined;
    if (p) this.say(p, actions);
    else this.toIdle();
  }

  private clampX() {
    const half = this.size / 2;
    this.x = Math.min(Math.max(this.x, half), innerWidth - half);
  }
}

/** Angle ramené entre -π et π */
function wrap(a: number) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
