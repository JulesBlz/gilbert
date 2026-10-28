// Les sessions de travail : « Gilbert, 25 minutes ». Il s'installe derrière son petit ordinateur et
// bosse avec toi ; rien ne l'en distrait (ni clic, ni vannes, ni notifications sauf l'urgent). Un
// gland par minute travaillée, parfois un gland doré au bout ; puis une pause, et « on remet ça ? ».

import type { Journal } from './journal';
import { goldenAcorn } from '../shared/pixels';
import type { Command, Lang } from '../shared/types';

/**
 * « Gilbert, 25 minutes », « on bosse 50 min », « pomodoro », « session de travail »… : seulement en
 * début de message, pour ne pas lancer une session quand on parle juste de concentration.
 */
export const FOCUS_START = /^\s*(gilbert[\s,]*)?((\d{1,3})\s*(min|mn|minutes|phút)\b|(pomodoro|session de travail|on bosse|au boulot|let'?s work|work session|làm việc thôi)\b)/i;

export class Focus {
  active: { startedAt: number; endsAt: number; minutes: number } | null = null;
  private timer: NodeJS.Timeout | null = null;
  private breakTimer: NodeJS.Timeout | null = null;

  constructor(private deps: {
    journal: Journal;
    send: (cmd: Command) => void;
    lang: () => Lang;
    tell: (text: string, actions?: { label: string; value: string }[], onAnswer?: (v: string) => void) => void;
    /** La session vient de commencer ou de finir (pour relâcher les messages en attente) */
    onChange: () => void;
  }) {}

  private t(fr: string, en: string, vi: string) {
    return { fr, en, vi }[this.deps.lang()];
  }

  /** Les minutes demandées dans un message (25 par défaut, entre 5 et 120) */
  static minutesIn(text: string) {
    const n = Number(text.match(/(\d{1,3})\s*(min|mn|minutes|phút)/i)?.[1] ?? 25);
    return Math.min(Math.max(n, 5), 120);
  }

  start(minutes: number) {
    if (this.active) return;
    if (this.breakTimer) clearTimeout(this.breakTimer);
    const now = Date.now();
    this.active = { startedAt: now, endsAt: now + minutes * 60_000, minutes };
    this.timer = setTimeout(() => this.finish(), minutes * 60_000);
    this.deps.send({ type: 'focus', on: true, endsAt: this.active.endsAt, minutes });
    this.deps.onChange();
  }

  /** Arrêtée avant la fin : les minutes (et leurs glands) comptent, mais pas de gland doré */
  stop() {
    const a = this.active;
    if (!a) return;
    if (this.timer) clearTimeout(this.timer);
    this.active = null;
    const minutes = Math.round((Date.now() - a.startedAt) / 60_000);
    this.deps.journal.focusStopped(minutes);
    this.deps.journal.addAcorns(minutes, false);
    this.deps.send({ type: 'focus', on: false, done: false, minutes, acorns: minutes, golden: false });
    this.deps.onChange();
  }

  private finish() {
    const a = this.active;
    if (!a) return;
    this.active = null;
    const j = this.deps.journal;
    j.focusDone(a.minutes);
    const golden = goldenAcorn(a.minutes);
    j.addAcorns(a.minutes, golden);
    this.deps.send({ type: 'focus', on: false, done: true, minutes: a.minutes, acorns: a.minutes, golden });
    this.deps.onChange();

    // la pause : 5 min après 25, 10 après 50 ou plus
    const pause = a.minutes >= 45 ? 10 : 5;
    setTimeout(() => this.deps.tell(this.t(
      `Pause de ${pause} min : lève-toi, bois un verre d'eau. Je te fais signe.`,
      `${pause}-minute break: stand up, have some water. I'll let you know.`,
      `Nghỉ ${pause} phút nhé: đứng dậy, uống cốc nước. Tớ sẽ gọi cậu.`)), 9000);
    this.breakTimer = setTimeout(() => this.deps.tell(
      this.t('La pause est finie. On remet ça ?', 'Break is over. Go again?', 'Hết giờ nghỉ rồi. Làm tiếp không?'),
      [{ label: '25 min', value: '25' }, { label: '50 min', value: '50' }, { label: this.t('Non merci', 'No thanks', 'Thôi khỏi'), value: 'no' }],
      (v) => { if (v !== 'no') this.start(Number(v)); },
    ), pause * 60_000 + 9000);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    if (this.breakTimer) clearTimeout(this.breakTimer);
  }
}
