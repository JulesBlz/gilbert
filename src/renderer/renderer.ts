// Jersey 10 : police pixel (OFL), nette à 20 px (deux fois sa grille de 10)
import '@fontsource/jersey-10/400.css';
// VT323 : la police pixel qui a les accents vietnamiens (Jersey 10 ne les a pas)
import '@fontsource/vt323/400.css';
import './style.css';

import { api, isPreview } from './api';
import { drawFrame, loadSprites, wearSkin } from './sprites';
import { Bubble, type Stream } from './bubble';
import { ChatBox } from './chat';
import { Mic } from './mic';
import { Pet } from './pet';
import { setSoundEnabled } from './audio';
import { formatSize, greeting, lines, pick, setLang } from './lines';
import type { BrainStatus, Command, Memory } from '../shared/types';
import { ACORN, GOLDEN_ACORN } from '../shared/pixels';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const bubble = new Bubble(document.getElementById('bubble')!);

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

/** Le modèle écrit parfois du markdown : la bulle n'en veut pas */
const plain = (t: string) => t.replace(/[*_#`]/g, '');

/** Une commande de musique tapée dans la discussion, ou null */
function musicCommand(text: string): 'status' | 'play' | 'pause' | 'next' | 'previous' | null {
  const t = text.trim().toLowerCase().replace(/[?!.]+$/, '').trim();
  if (/^(suivant|chanson suivante|morceau suivant|next|skip|zappe|change de (musique|chanson|son))$/.test(t)) return 'next';
  if (/^(précédent|precedent|chanson précédente|morceau précédent|previous|reviens en arrière)$/.test(t)) return 'previous';
  if (/^(pause|stop|stop la musique|coupe la musique|mets pause|chut la musique)$/.test(t)) return 'pause';
  if (/^(play|lecture|reprends|remets la musique|relance la musique|resume|mets de la musique)$/.test(t)) return 'play';
  if (/^(c'est quoi (ce son|cette musique|cette chanson|ce morceau)|qu'est-ce qui joue|what's playing|what is this song)$/.test(t)) return 'status';
  return null;
}

async function main() {
  if (isPreview) document.body.classList.add('preview');
  resizeCanvas();
  const settings = await api.getSettings();
  await Promise.all([loadSprites(settings.skin), document.fonts.ready]);
  setLang(settings.lang);
  setSoundEnabled(!settings.muted);
  const pet = new Pet(settings, bubble, (x) => api.savePosition(x));
  // aperçu navigateur : Gilbert accessible depuis la console pour le débogage
  if (isPreview) Object.assign(window, { __pet: pet, __wear: wearSkin, __draw: drawFrame });

  // ---------- cerveau et discussion ----------

  let brain: BrainStatus = await api.brainStatus();
  let memory: Memory = await api.memoryGet();
  /** « Noté : … » en attente, dits dès que Gilbert a fini de parler */
  const notes: string[] = [];
  /** Ce que l'assistant veut te dire (mail important, réunion, échéance), un message à la fois */
  const notices: Extract<Command, { type: 'notify' }>[] = [];
  /**
   * Message à boutons affiché mais pas encore répondu. S'il disparaît sans réponse (Gilbert
   * attrapé, discussion ouverte, parti se cacher), il le redit un peu plus tard, deux fois au plus.
   */
  /** Session de travail : temps restant au-dessus de sa tête */
  const focusTag = document.getElementById('focus-tag')!;
  /** Aide discrète affichée (presse-papiers), le temps qu'on la prenne */
  let offer: string | null = null;
  pet.onWorkClick = () => {
    const m = Math.max(1, Math.ceil((pet.focusEnds - Date.now()) / 60_000));
    pet.whisper(pick(lines.focusLeft, { m }), [
      {
        label: pick(lines.focusStop),
        run: () => pet.whisper(pick(lines.focusSure), [
          { label: pick(lines.focusYes), run: () => api.focus('stop') },
          { label: pick(lines.focusNo), run: () => {} },
        ]),
      },
      { label: pick(lines.focusGoOn), run: () => {} },
    ]);
  };
  let unanswered: { n: Extract<Command, { type: 'notify' }>; shown: number; goneAt: number; queued: boolean } | null = null;
  let asking: { id: number; stream: Stream | null } | null = null;
  let nextId = 1;

  const chat = new ChatBox(
    document.getElementById('chat')!,
    (text) => {
      api.setFocus(false);
      // « aide », « qu'est-ce que tu sais faire ? » : le guide
      if (/^\s*(aide|help|guide|\?|que sais-tu faire|qu'?est-ce que tu sais faire|tu sais faire quoi|what can you do|giúp|hướng dẫn|cậu làm được gì)\s*[?!.]*\s*$/i.test(text)) {
        pet.stopListening();
        api.openSettings('guide');
        pet.say(pick(lines.guideOpened));
        return;
      }
      // « brief », « le point » : il refait le brief du jour
      if (/^\s*(le\s+)?(brief(ing)?|point du jour|rundown)\s*[?!.]*\s*$/i.test(text)) {
        pet.stopListening();
        // le brief prend quelques secondes à écrire : il réfléchit, pour qu'on sache qu'il s'en occupe
        pet.think();
        api.replayBrief();
        return;
      }
      // musique : « pause », « suivant », « reprends », « c'est quoi ce son ? »
      const music = musicCommand(text);
      if (music) {
        pet.stopListening();
        api.music(music).then((t) => {
          const track = { fr: `« ${t.title} » de ${t.artist}`, en: `"${t.title}" by ${t.artist}`, vi: `« ${t.title} » của ${t.artist}` }[pet.settings.lang];
          if (!t.player || !t.title) return pet.say(pick(lines.musicNone));
          const key = music === 'next' ? 'musicNext' : music === 'previous' ? 'musicPrevious' : music === 'status' ? 'musicNow' : t.playing ? 'musicPlaying' : 'musicPaused';
          pet.say(pick(lines[key], { track }));
        });
        return;
      }
      const id = nextId++;
      asking = { id, stream: null };
      pet.think();
      api.brainAsk(id, text);
    },
    () => {
      api.setFocus(false);
      pet.stopListening();
    },
  );
  chat.onSettings = () => api.openSettings();
  // note vocale : un clic pour parler, il s'arrête tout seul quand tu te tais. Ce qu'il entend
  // s'écrit dans le champ au fil de la voix ; à la fin, tu relis, tu corriges si besoin, et Entrée.
  const mic = new Mic();
  chat.onMic = async () => {
    if (mic.recording) return mic.stop();
    if (!(await api.micPermission().catch(() => false))) return;
    chat.setMic('recording');
    let live: Promise<void> | null = null;
    const pcm = await mic.record((sofar) => {
      // une transcription à la fois : celle d'après reprendra tout le son entendu jusque-là
      live ??= api.transcribe(sofar)
        .then((text) => { if (mic.recording && text) chat.setDraft(text, true); })
        .catch(() => {})
        .finally(() => { live = null; });
    }).catch(() => null);
    if (!pcm) return chat.setMic('off');
    chat.setMic('busy');
    await live;
    const text = await api.transcribe(pcm).catch(() => '');
    chat.setMic('off');
    chat.setDraft(text);
  };
  // un clic ailleurs sur l'écran fait perdre le focus à la fenêtre : on referme
  window.addEventListener('blur', () => chat.close());


  const offerDownload = () => {
    if (brain.state !== 'missing' && brain.state !== 'error') return;
    const size = formatSize(brain.state === 'missing' ? brain.size : 7.1e9);
    pet.say(pick(lines.brainMissing, { size }), [
      { label: pick(lines.brainYes), run: () => { api.brainDownload(); pet.say(pick(lines.brainStarted)); } },
      { label: pick(lines.brainLater), run: () => pet.say(pick(lines.brainLaterOk)) },
    ]);
  };

  /** Ouvre le champ de discussion ; `example` s'affiche en grisé (ce qu'on peut taper), ou déjà écrit (`fill`) */
  const openChat = (example?: string, fill = false) => {
    if (asking || brain.state !== 'ready') return false;
    pet.listen();
    api.setFocus(true);
    if (fill && example) chat.show(pick(lines.chatPlaceholder), { value: example });
    else chat.show(example ?? pick(lines.chatPlaceholder));
    return true;
  };
  pet.clickHandler = () => {
    switch (brain.state) {
      case 'ready':
        return openChat();
      case 'missing':
      case 'error':
        offerDownload();
        return true;
      case 'downloading':
        pet.say(pick(lines.brainDownloading, { p: Math.round(brain.progress * 100) }));
        return true;
      case 'loading':
        pet.say(pick(lines.brainLoading));
        return true;
    }
  };

  api.onBrain((e) => {
    if (!asking || e.id !== asking.id) return;
    if (e.kind === 'chunk') {
      asking.stream ??= pet.answer();
      asking.stream.push(plain(e.text));
      return;
    }
    if (e.kind === 'done' && asking.stream) asking.stream.end();
    else if (e.kind === 'done' && e.text.trim()) pet.say(plain(e.text.trim()));
    else pet.say(pick(lines.askFailed));
    asking = null;
  });

  // ---------- commandes du process principal ----------

  api.onCommand((cmd) => {
    switch (cmd.type) {
      case 'settings':
        pet.settings = cmd.settings;
        wearSkin(cmd.settings.skin);
        setLang(cmd.settings.lang);
        setSoundEnabled(!cmd.settings.muted);
        pet.resize();
        break;
      case 'idle':
        pet.userIdle(cmd.seconds);
        break;
      case 'chat':
        // « Lui parler » (menu) ou « Essayer » (guide) : il descend s'il est caché, et t'écoute
        pet.call(() => openChat(cmd.text, cmd.fill));
        break;
      case 'bye':
        pet.leave(cmd.home);
        break;
      case 'perch':
        pet.setPerch(cmd.at);
        break;
      case 'aside':
        pet.stepAside(cmd.x0, cmd.x1);
        break;
      case 'hide':
        // « Essayer » dans le guide : il montre où il se cache, et comment le faire revenir
        pet.say(pick(lines.hideHint), undefined, () => setTimeout(() => pet.goUp(), 2500));
        break;
      case 'focus':
        if (cmd.on) {
          pet.startWork(cmd.endsAt);
          focusTag.hidden = false;
        } else {
          focusTag.hidden = true;
          // fin de session : un gland tombe (doré, avec un peu de chance)
          pet.endWork(cmd.done ? (cmd.golden ? GOLDEN_ACORN : ACORN) : null);
          const said = pick(cmd.done ? lines.focusDone : lines.focusStopped, { m: cmd.minutes, n: cmd.acorns });
          setTimeout(() => pet.say(cmd.golden ? `${said} ${pick(lines.goldenAcorn)}` : said), cmd.done ? 900 : 0);
        }
        break;
      case 'offer': {
        // une aide discrète : il ne bouge pas ; la bulle s'en va si on ne la prend pas
        // (une aide déjà affichée peut être remplacée : « … » puis le résultat)
        if (asking || chat.open || (bubble.visible && !offer)) break;
        offer = cmd.id;
        if (cmd.thinking) pet.whisperThinking();
        else {
          const actions = cmd.actions.map((a) => ({ label: a.label, run: () => { offer = null; api.notifyAnswer(cmd.id, a.value); } }));
          pet.whisper(cmd.text, actions.length ? actions : undefined, undefined, cmd.long);
        }
        const ttl = cmd.ttl ?? 12_000;
        if (ttl) setTimeout(() => { if (offer === cmd.id) { offer = null; bubble.hide(); } }, ttl);
        break;
      }
      case 'thinking':
        if (cmd.on && !asking && !chat.open && pet.isIdle() && !pet.quiet) {
          pet.think();
          // filet de sécurité : si la fin ne vient jamais (erreur du cerveau), il arrête de réfléchir
          setTimeout(() => { if (!asking) pet.stopThinking(); }, 90_000);
        }
        if (!cmd.on && !asking) pet.stopThinking();
        break;
      case 'meeting':
        pet.meeting = cmd.on;
        break;
      case 'quiet':
        if (!pet.onCeiling) pet.say(pick(cmd.on ? lines.quietOn : lines.quietOff));
        break;
      case 'memory':
        memory = cmd.memory;
        break;
      case 'learned':
        notes.push(...cmd.facts);
        break;
      case 'mood':
        pet.mood = cmd.value;
        break;
      case 'notify':
        notices.push(cmd);
        break;
      case 'brain': {
        const before = brain.state;
        const now: BrainStatus = cmd.status;
        brain = now;
        if (before === 'downloading' && now.state === 'ready') pet.say(pick(lines.brainReady));
        if (now.state === 'error' && before !== 'error') pet.say(pick(lines.brainError, { msg: now.message }));
        break;
      }
    }
  });

  // ---------- souris : la fenêtre ne capte la souris qu'au-dessus de Gilbert, de sa bulle ou du champ ----------

  let capturing = false;
  const updateCapture = (x: number, y: number) => {
    const onPet = pet.hit(x, y);
    const over = pet.holding || onPet || bubble.contains(x, y) || chat.contains(x, y);
    canvas.classList.toggle('over', onPet);
    canvas.classList.toggle('dragging', pet.holding);
    if (over !== capturing) {
      capturing = over;
      api.setIgnoreMouse(!over);
    }
  };

  window.addEventListener('mousemove', (e) => {
    pet.pointerMove(e.clientX, e.clientY);
    updateCapture(e.clientX, e.clientY);
  });
  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (chat.open && pet.hit(e.clientX, e.clientY)) {
      // re-cliquer sur Gilbert referme la discussion (et compte pour les clics à répétition)
      chat.close();
      pet.registerClick();
      return;
    }
    pet.pointerDown(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    pet.pointerUp();
    updateCapture(e.clientX, e.clientY);
  });
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (pet.hit(e.clientX, e.clientY)) api.showMenu();
  });
  window.addEventListener('resize', () => {
    resizeCanvas();
    pet.resize();
  });

  // ---------- répliques spontanées (rares, jamais en mode Chut) ----------

  const scheduleChatter = () => {
    const minutes = 20 + Math.random() * 25;
    setTimeout(() => {
      if (pet.isIdle() && !pet.quiet) pet.say(pick(lines.idle));
      scheduleChatter();
    }, minutes * 60_000);
  };
  scheduleChatter();
  const briefSoon = await api.briefPending().catch(() => false);
  pet.onPlay = (kind) => api.played(kind);
  // il sort de sa poubelle ; et on quitte quand il y est retourné
  pet.onQuit = () => api.quit();
  pet.onPulledDown = () => api.tried('hide');
  pet.onGrab = () => { api.home().then((h) => pet.setHome(h)).catch(() => {}); };
  pet.emerge(await api.home().catch(() => null));
  // ---------- la toute première fois : faire connaissance (on peut refuser, ou passer chaque question) ----------

  const INTRO: [keyof Memory['profile'], 'introName' | 'introCity' | 'introJob' | 'introFuel' | 'introGoal'][] = [
    ['name', 'introName'], ['city', 'introCity'], ['job', 'introJob'], ['fuel', 'introFuel'], ['goal', 'introGoal'],
  ];
  /** Il pose les questions l'une après l'autre dans le champ de discussion ; Entrée sur un champ vide passe */
  const askIntro = (i = 0, answers: Partial<Memory['profile']> = {}) => {
    const finish = () => {
      api.setFocus(false);
      pet.stopListening();
      api.introDone(answers);
      pet.say(pick(lines.introDone, { name: answers.name ?? '' }).replace(/\s+!/, ' !').replace(' ,', ','), undefined, () => setTimeout(offerDownload, 1500));
    };
    if (i >= INTRO.length) return finish();
    const [key, line] = INTRO[i];
    pet.listen();
    api.setFocus(true);
    chat.show(pick(lines.introHint), {
      prompt: pick(lines[line]),
      allowEmpty: true,
      onSubmit: (text) => askIntro(i + 1, text ? { ...answers, [key]: text } : answers),
      // Échap : on s'arrête là, avec ce qu'on a déjà
      onCancel: finish,
    });
  };
  const offerIntro = () => {
    pet.say(pick(lines.introAsk), [
      { label: pick(lines.introYes), run: () => askIntro() },
      { label: pick(lines.introLater), run: () => pet.say(pick(lines.introLaterOk), undefined, () => setTimeout(offerDownload, 1500)) },
      { label: pick(lines.introNo), run: () => { api.introDone({}); pet.say(pick(lines.introNoOk), undefined, () => setTimeout(offerDownload, 1500)); } },
    ]);
  };
  const firstTime = !memory.onboarded && !memory.profile.name;

  // le bonjour dépend de son humeur (si elle est activée : sinon elle reste neutre)
  setTimeout(() => {
    if (pet.quiet) return;
    // la toute première fois : il se présente et propose de faire connaissance
    if (firstTime) return offerIntro();
    const mood = pet.mood < 0.3 ? pick(lines.greetSulky) : pet.mood > 0.8 ? pick(lines.greetFond) : '';
    pet.say(briefSoon ? `${mood ? `${mood} ` : ''}${pick(lines.briefSoon)}` : mood || greeting(memory.profile.name));
  }, 1200);
  // après la salutation : il propose son cerveau s'il n'en a pas encore (après les questions, la première fois)
  setTimeout(() => { if (!firstTime && pet.isIdle()) offerDownload(); }, 7000);

  // ---------- boucle d'animation : on n'efface que la zone redessinée ----------

  let last = performance.now();
  let dirty = { x: 0, y: 0, w: innerWidth, h: innerHeight };
  const loop = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    pet.update(dt);
    const free = !asking && !chat.open && (pet.isIdle() || pet.onCeiling || (pet.working && !bubble.visible));
    if (unanswered && !unanswered.queued && !bubble.visible && pet.isIdle()) {
      unanswered.goneAt ||= now;
      if (now - unanswered.goneAt > 4000) {
        // redit en tête de file, ou abandonné après trois fois
        if (unanswered.shown < 3) { notices.unshift(unanswered.n); unanswered.queued = true; }
        else unanswered = null;
      }
    } else if (unanswered && bubble.visible) unanswered.goneAt = 0;
    // une aide du presse-papiers reste affichée tant qu'on ne l'a pas fermée : l'urgent passe devant
    if (notices[0]?.urgent && offer && bubble.visible && !asking && !chat.open) {
      offer = null;
      bubble.hide();
    }
    if (notices.length && free) {
      const n = notices.shift()!;
      if (n.actions) unanswered = { n, shown: unanswered?.n === n ? unanswered.shown + 1 : 1, goneAt: 0, queued: false };
      const actions = n.actions?.map((a) => ({ label: a.label, run: () => { unanswered = null; api.notifyAnswer(n.id, a.value); } }));
      // le petit « ! » : l'urgent, et ce qui vient d'arriver (un mail, un message)
      if (n.urgent || n.alert) pet.alert(n.text, actions);
      else pet.say(n.text, actions);
    } else if (notes.length && pet.isIdle() && !pet.quiet) {
      pet.say(pick(lines.learned, { fact: notes.shift()! }));
    }
    ctx.clearRect(dirty.x, dirty.y, dirty.w, dirty.h);
    dirty = pet.draw(ctx);
    if (chat.open) chat.place(pet.anchor.x, pet.anchor.y);
    if (pet.focusEnds) {
      const left = Math.max(0, Math.ceil((pet.focusEnds - Date.now()) / 1000));
      focusTag.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      // au-dessus de la tête, ou à côté de la bulle quand il parle
      focusTag.style.left = `${pet.anchor.x}px`;
      focusTag.style.top = `${pet.anchor.y - (bubble.visible ? 0 : 6)}px`;
      focusTag.style.visibility = bubble.visible ? 'hidden' : 'visible';
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

main().catch((err) => console.error("Gilbert n'a pas pu démarrer :", err));
