// L'humeur de Gilbert (désactivable dans les réglages) : il s'attache quand on joue avec lui,
// qu'on lui parle, qu'on travaille ensemble ; il boude un peu quand on l'oublie des jours entiers.
// Et chaque année, il fête le jour de votre rencontre.

import { app } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Lang } from '../shared/types';

const file = () => path.join(app.getPath('userData'), 'mood.json');
const DAY = 86_400_000;
/** Ce que rapporte chaque interaction (les clics plafonnent par jour : pas de triche) */
const GAIN = { click: 1, throw: 1, chat: 2, focus: 4 } as const;
const MAX_CLICKS_PER_DAY = 6;
/** Ce qu'il perd par jour sans te voir */
const MISS_PER_DAY = 7;

interface Saved {
  /** 0 = boude franchement, 100 = t'adore */
  score: number;
  lastSeen: number;
  clicksToday: number;
  clicksDay: string;
}

const today = () => new Date().toDateString();

export class Mood {
  private saved: Saved;

  constructor() {
    try {
      this.saved = { score: 60, lastSeen: Date.now(), clicksToday: 0, clicksDay: today(), ...JSON.parse(readFileSync(file(), 'utf8')) };
    } catch {
      this.saved = { score: 60, lastSeen: Date.now(), clicksToday: 0, clicksDay: today() };
    }
    // les jours d'absence comptent au lancement
    const missed = Math.floor((Date.now() - this.saved.lastSeen) / DAY);
    if (missed >= 1) this.saved.score = Math.max(0, this.saved.score - missed * MISS_PER_DAY);
    this.daysAway = missed;
    this.seen();
  }

  /** Jours passés sans te voir avant ce lancement */
  readonly daysAway: number;

  private save() {
    writeFileSync(file(), JSON.stringify(this.saved));
  }

  private seen() {
    this.saved.lastSeen = Date.now();
    this.save();
  }

  /** 0 à 1 */
  get value() {
    return this.saved.score / 100;
  }

  played(kind: keyof typeof GAIN) {
    if (kind === 'click') {
      if (this.saved.clicksDay !== today()) { this.saved.clicksDay = today(); this.saved.clicksToday = 0; }
      if (++this.saved.clicksToday > MAX_CLICKS_PER_DAY) return;
    }
    this.saved.score = Math.min(100, this.saved.score + GAIN[kind]);
    this.seen();
  }

  /** Une ligne pour sa personnalité (ce qu'il ressent en ce moment), selon la langue */
  line(lang: Lang) {
    const v = this.value, fr = lang === 'fr';
    if (v < 0.3) {
      return fr
        ? `Ton humeur : tu boudes un peu, il t'a laissé tout seul${this.daysAway >= 2 ? ` ${this.daysAway} jours` : ''}. Sois un brin boudeur et piquant au début, puis tu te laisses amadouer.`
        : `Your mood: you're sulking a little, they left you alone${this.daysAway >= 2 ? ` for ${this.daysAway} days` : ''}. Be a bit sulky and prickly at first, then let yourself be won over.`;
    }
    if (v > 0.8) {
      return fr
        ? "Ton humeur : tu l'adores en ce moment, tu es particulièrement affectueux (sans en faire trop)."
        : "Your mood: you adore them right now, you're especially affectionate (without overdoing it).";
    }
    return '';
  }
}

/** Le jour anniversaire de votre rencontre (« 1 an », « 2 ans »), ou 0 */
export function friendship(firstSeen: number, now = new Date()) {
  const f = new Date(firstSeen);
  const years = now.getFullYear() - f.getFullYear();
  return years >= 1 && now.getMonth() === f.getMonth() && now.getDate() === f.getDate() ? years : 0;
}
