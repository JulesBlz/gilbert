// Gilbert jette un œil à ton écran de temps en temps (si tu l'y autorises) :
// - une vraie erreur à l'écran → il te le dit, une fois ;
// - de temps en temps, une vanne sur ce que tu fais (selon son humour) ;
// - en visio ou en présentation → il se tait tout seul jusqu'à la fin ;
// - une échéance ou un rendez-vous approche et tu es depuis 8 min sur YouTube, Netflix, un réseau
//   social… → il te rappelle gentiment à l'ordre (de moins en moins gentiment s'il insiste).
// Il ne regarde que quand tu es devant l'écran, jamais les gestionnaires de mots de passe ni ses
// propres fenêtres, et ne garde rien : ni image, ni texte.

import { screen, type BrowserWindow } from 'electron';
import { detectProblem, normalize, worthSaying } from '../brain/detect';
import { SPEAK } from '../../shared/types';
import type { Brain } from '../brain/brain';
import type { Humor, Lang } from '../../shared/types';
import { frontWindow, permission, readWindow, type FrontWindow } from './capture';

const LOOK_EVERY = 40_000;
/** Il ne regarde que si tu as touché clavier ou souris il y a moins de… (s) */
const ACTIVE_WITHIN = 20;
const REMARK_GAP = 3 * 60_000;
/** Écart moyen entre deux vannes sur ce que tu fais, selon son humour (0 = jamais) */
const QUIP_GAP: Record<Humor, number> = { sober: 0, normal: 35 * 60_000, unbearable: 12 * 60_000 };
const MAX_CHARS = 2400;

/** Appli à ne jamais lire */
const PRIVATE = /1password|bitwarden|dashlane|keepass|lastpass|proton ?pass|enpass|keychain|trousseau|passwords|mots de passe|keeper/i;
const MEETING_APPS = /^(zoom\.us|zoom|microsoft teams|teams|ms-teams|facetime|webex|cisco webex meetings|skype)$/i;
const MEETING_TITLES = /\bmeet\s*[-–—]|google meet|zoom meeting|réunion zoom|whereby|jitsi|\b(appel|call|réunion|meeting)\b.*\bteams\b/i;
const SLIDES = /^(keynote|microsoft powerpoint|powerpnt|libreoffice impress)$/i;
/** Ce qui détourne de ce qu'on doit faire : appli ou titre de fenêtre (le site est dans le titre du navigateur) */
const DISTRACTION = /\b(youtube|netflix|twitch|tiktok|instagram|facebook|reddit|twitter|prime video|disney\+|9gag|steam|discord|x\.com)\b|(^| - )X$/i;
const FOCUS = { after: 8 * 60_000, gap: 25 * 60_000 };

export class ScreenWatcher {
  private timer: NodeJS.Timeout | null = null;
  private looking = false;
  private lastText = '';
  private said = new Set<string>();
  private lastRemark = 0;
  private nextQuip = 0;
  private meeting = false;
  private distractedSince = 0;
  private lastNudge = 0;
  private nudges = 0;

  constructor(private deps: {
    brain: Brain;
    own: () => BrowserWindow | null;
    lang: () => Lang;
    humor: () => Humor;
    userIdle: () => number;
    /** Chut demandé par l'utilisateur */
    quiet: () => boolean;
    say: (text: string, evenIdle?: boolean) => void;
    /** Ce qu'il sait de toi (procrastination, phrase qui remotive) pour le rappel à l'ordre */
    profile?: () => { procrastination: string; motivation: string };
    /** Ce qui presse : la prochaine échéance ou le prochain rendez-vous, s'il est proche */
    pressure: () => { what: string; minutes: number } | null;
    /** Début ou fin d'une visio / présentation */
    onMeeting: (on: boolean) => void;
  }) {
    this.planQuip();
  }

  setEnabled(on: boolean) {
    if (on && !this.timer) this.timer = setInterval(() => this.look().catch(() => {}), LOOK_EVERY);
    if (!on && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.setMeeting(false);
    }
  }

  private planQuip() {
    const gap = QUIP_GAP[this.deps.humor()];
    this.nextQuip = gap ? Date.now() + gap * (0.6 + Math.random() * 0.8) : Infinity;
  }

  private setMeeting(on: boolean) {
    if (on === this.meeting) return;
    this.meeting = on;
    this.deps.onMeeting(on);
  }

  private inMeeting(w: FrontWindow) {
    if (MEETING_APPS.test(w.app) || MEETING_TITLES.test(w.title)) return true;
    // diaporama en plein écran
    if (SLIDES.test(w.app) && w.bounds) {
      const d = screen.getDisplayMatching(w.bounds).bounds;
      return w.bounds.width >= d.width && w.bounds.height >= d.height;
    }
    return false;
  }

  /** Distrait depuis un moment alors que quelque chose presse : un petit rappel à l'ordre */
  private async focus(w: FrontWindow) {
    const now = Date.now();
    const m = `${w.app} ${w.title}`.match(DISTRACTION);
    if (!m) {
      this.distractedSince = 0;
      return;
    }
    const site = m[1] ?? 'X';
    this.distractedSince ||= now;
    if (now - this.distractedSince < FOCUS.after || now - this.lastNudge < FOCUS.gap || this.deps.brain.status.state !== 'ready') return;
    const p = this.deps.pressure();
    if (!p) return;
    this.lastNudge = now;
    this.nudges++;
    const lang = this.deps.lang();
    const mins = Math.round((now - this.distractedSince) / 60_000);
    const left = p.minutes >= 90 ? `${Math.round(p.minutes / 60)} h` : `${p.minutes} min`;
    const tone = this.nudges > 1 ? 'Tu l’as déjà prévenu : sois plus direct, toujours drôle.' : 'Reste léger et bienveillant.';
    const me = this.deps.profile?.();
    const known = [
      me?.procrastination && `Il sait lui-même que sa pire procrastination, c'est : ${me.procrastination}.`,
      me?.motivation && this.nudges > 1 && `Sa phrase pour se remotiver : « ${me.motivation} » (tu peux la lui rappeler).`,
    ].filter(Boolean).join(' ');
    const out = await this.deps.brain.compose([
      `Ça fait ${mins} minutes que ton humain est sur ${site}, alors qu’il a « ${p.what} » dans ${left}.`,
      `En une phrase de 20 mots maximum, ${SPEAK[lang]}, rappelle-le à l'ordre avec humour, sans faire la morale. ${tone} ${known}`,
    ].join('\n'), 70);
    const line = out?.split('\n').map((l) => l.trim().replace(/^["«]\s*|\s*["»]$/g, '')).find(Boolean);
    // devant une vidéo, il n'y a ni clavier ni souris : il parle quand même
    if (line) this.deps.say(line, true);
  }

  /** Le guide : il lit la fenêtre au premier plan maintenant, et dit ce qu'il en pense (même s'il n'y a rien) */
  async tryNow() {
    const lang = this.deps.lang();
    const t = (fr: string, en: string, vi: string) => ({ fr, en, vi })[lang];
    const w = await frontWindow();
    if (!w || w.pid === process.pid || PRIVATE.test(`${w.app} ${w.bundle}`)) {
      this.deps.say(t('Je ne vois que ma propre fenêtre. Réessaie en te mettant sur une autre appli.', 'All I can see is my own window. Try again from another app.', 'Tớ chỉ thấy cửa sổ của tớ. Thử lại từ ứng dụng khác nhé.'), true);
      return;
    }
    const lines = await readWindow(w, this.deps.own());
    const d = lines.length >= 3 ? await detectProblem(this.deps.brain, { app: w.app, title: w.title, text: clip(lines) }, lang) : null;
    if (d && worthSaying(d, clip(lines))) this.deps.say(d.remark, true);
    else if (d?.quip) this.deps.say(`${t('Rien qui cloche.', 'Nothing wrong.', 'Không có gì sai.')} ${d.quip}`, true);
    else this.deps.say(t(`Rien à signaler dans ${w.app} : pas d’erreur, pas de faute. Je reste discret.`, `Nothing to report in ${w.app}: no error, no typo. I'll stay discreet.`, `Không có gì trong ${w.app}: không lỗi, không sai chính tả. Tớ sẽ im lặng.`), true);
  }

  async look() {
    // devant une vidéo, on ne touche ni clavier ni souris : la distraction se voit quand même
    if (this.looking || this.deps.userIdle() > 15 * 60) return;
    this.looking = true;
    try {
      const w = await frontWindow();
      if (!w) return;
      this.setMeeting(this.inMeeting(w));
      if (this.meeting || this.deps.quiet() || w.pid === process.pid || PRIVATE.test(`${w.app} ${w.bundle}`)) return;
      await this.focus(w);
      if (this.deps.userIdle() > ACTIVE_WITHIN) return;
      if (this.deps.brain.status.state !== 'ready' || permission() !== 'granted') return;

      const lines = await readWindow(w, this.deps.own());
      if (lines.length < 3) return;
      const text = clip(lines);
      // rien n'a vraiment changé depuis la dernière fois
      if (similarity(text, this.lastText) > 0.9) return;
      this.lastText = text;

      const d = await detectProblem(this.deps.brain, { app: w.app, title: w.title, text }, this.deps.lang());
      if (!d || this.deps.userIdle() > ACTIVE_WITHIN) return;
      const now = Date.now();
      const key = normalize(d.quote);
      if (worthSaying(d, text) && !this.said.has(key) && now - this.lastRemark > REMARK_GAP) {
        this.said.add(key);
        this.lastRemark = now;
        this.deps.say(d.remark);
      } else if (d.problem === 'aucun' && d.quip && now > this.nextQuip && now - this.lastRemark > REMARK_GAP) {
        this.lastRemark = now;
        this.planQuip();
        this.deps.say(d.quip);
      }
    } finally {
      this.looking = false;
    }
  }
}

/** Trop long : le début (titre, destinataires) et surtout la fin (dernières lignes d'un terminal) */
function clip(lines: string[]) {
  const text = lines.join('\n');
  if (text.length <= MAX_CHARS) return text;
  const head = Math.round(MAX_CHARS * 0.3);
  return `${text.slice(0, head)}\n[…]\n${text.slice(text.length - (MAX_CHARS - head))}`;
}

/** Part des lignes communes à deux lectures (0 à 1) */
function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  const A = new Set(a.split('\n')), B = new Set(b.split('\n'));
  let common = 0;
  for (const l of A) if (B.has(l)) common++;
  return common / Math.max(A.size, B.size);
}
