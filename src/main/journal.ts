// Le carnet de bord : ce qui s'est passé chaque jour (applis utilisées, sessions de travail,
// rappels cochés, mails importants), une note de 3 lignes écrite par Gilbert le soir, le résumé
// de la semaine le vendredi, et les glands gagnés en travaillant.
// Tout est dans journal.json, sur la machine.

import { app } from 'electron';
import { EventEmitter } from 'node:events';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { LOCALE, SPEAK, type JournalData, type JournalDay, type Lang } from '../shared/types';
import type { Brain } from './brain/brain';
import { toBubbles } from './brief';

const file = () => path.join(app.getPath('userData'), 'journal.json');
const KEEP_DAYS = 400;

export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Le lundi de la semaine de `d` (AAAA-MM-JJ) */
export function weekOf(d: Date) {
  const m = new Date(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return isoDay(m);
}

const emptyDay = (): JournalDay => ({ apps: {}, focus: { sessions: 0, minutes: 0, stopped: 0 }, done: [], mails: 0, chats: 0, note: '' });

export class Journal extends EventEmitter {
  data: JournalData;
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    let saved: Partial<JournalData> = {};
    try {
      saved = JSON.parse(readFileSync(file(), 'utf8'));
    } catch { /* premier lancement */ }
    this.data = { days: {}, weeks: {}, acorns: { total: 0, golden: 0 }, firstSeen: Date.now(), ...saved };
    // les trésors d'une ancienne version ont été remplacés par les glands
    delete (this.data as { treasures?: unknown }).treasures;
    if (!saved.firstSeen) this.save();
  }

  /** Écriture groupée : l'échantillonnage des applis écrit souvent */
  private save(now = false) {
    if (this.timer) clearTimeout(this.timer);
    const write = () => {
      const old = isoDay(new Date(Date.now() - KEEP_DAYS * 86_400_000));
      for (const k of Object.keys(this.data.days)) if (k < old) delete this.data.days[k];
      mkdirSync(path.dirname(file()), { recursive: true });
      const tmp = `${file()}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.data));
      renameSync(tmp, file());
      this.emit('change', this.data);
    };
    if (now) write();
    else this.timer = setTimeout(write, 5000);
  }

  flush() {
    if (this.timer) { clearTimeout(this.timer); this.save(true); }
  }

  day(d = new Date()) {
    const k = isoDay(d);
    return (this.data.days[k] ??= emptyDay());
  }

  /** Une minute passée dans `appName` */
  addAppMinute(appName: string) {
    if (!appName) return;
    const apps = this.day().apps;
    apps[appName] = (apps[appName] ?? 0) + 1;
    this.save();
  }

  count(what: 'mails' | 'chats') {
    this.day()[what]++;
    this.save();
  }

  taskDone(title: string) {
    this.day().done.push(title);
    this.save();
  }

  /** Décochée finalement : elle ne compte plus dans ce qui est fait aujourd'hui */
  taskUndone(title: string) {
    const done = this.day().done;
    const i = done.lastIndexOf(title);
    if (i < 0) return;
    done.splice(i, 1);
    this.save();
  }

  focusDone(minutes: number) {
    const f = this.day().focus;
    f.sessions++;
    f.minutes += minutes;
    this.save(true);
  }

  focusStopped(minutes: number) {
    const f = this.day().focus;
    f.stopped++;
    f.minutes += minutes;
    this.save(true);
  }

  /** Jours d'affilée (jusqu'à aujourd'hui ou hier) avec au moins une session terminée */
  streak(now = new Date()) {
    let n = 0;
    const d = new Date(now);
    if (!this.data.days[isoDay(d)]?.focus.sessions) d.setDate(d.getDate() - 1);
    while (this.data.days[isoDay(d)]?.focus.sessions) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  /** Glands gagnés (un par minute travaillée), et peut-être un gland doré */
  addAcorns(n: number, golden: boolean) {
    this.data.acorns.total += n;
    if (golden) this.data.acorns.golden++;
    const day = this.day();
    day.acorns = (day.acorns ?? 0) + n;
    this.save(true);
  }

  /** Ce qu'il reste à dépenser (gagné moins dépensé) */
  get wallet() {
    const a = this.data.acorns, spent = a.spent ?? { acorns: 0, golden: 0 };
    return { acorns: a.total - spent.acorns, golden: a.golden - spent.golden };
  }

  /** Paie à la boutique ; false si ça ne suffit pas */
  spend(price: { acorns: number; golden: number }) {
    const w = this.wallet;
    if (w.acorns < price.acorns || w.golden < price.golden) return false;
    const spent = this.data.acorns.spent ?? { acorns: 0, golden: 0 };
    this.data.acorns.spent = { acorns: spent.acorns + price.acorns, golden: spent.golden + price.golden };
    this.save(true);
    return true;
  }

  setNote(dayKey: string, note: string) {
    (this.data.days[dayKey] ??= emptyDay()).note = note;
    this.save(true);
  }

  setWeek(monday: string, summary: string) {
    this.data.weeks[monday] = summary;
    this.save(true);
  }

  /** Les applis les plus utilisées d'un jour, en minutes */
  topApps(day: JournalDay, n = 5) {
    return Object.entries(day.apps).sort((a, b) => b[1] - a[1]).slice(0, n);
  }
}

// ---------- ce que Gilbert en écrit ----------

/** Les faits d'une journée, en lignes (pour le cerveau) */
export function dayFacts(j: Journal, key: string, lang: Lang) {
  const d = j.data.days[key];
  if (!d) return [];
  const fr = lang === 'fr';
  const date = new Date(`${key}T12:00`).toLocaleDateString(LOCALE[lang], { weekday: 'long', day: 'numeric', month: 'long' });
  const apps = j.topApps(d).map(([a, m]) => `${a} ${m} min`).join(', ');
  return [
    `${fr ? 'Jour' : 'Day'} : ${date}`,
    apps && `${fr ? 'Applis' : 'Apps'} : ${apps}`,
    d.focus.sessions || d.focus.stopped ? `${fr ? 'Sessions de travail' : 'Work sessions'} : ${d.focus.sessions} ${fr ? 'terminées' : 'completed'}, ${d.focus.stopped} ${fr ? 'arrêtées' : 'stopped'}, ${d.focus.minutes} min` : '',
    d.done.length ? `${fr ? 'Fait' : 'Done'} : ${d.done.join(', ')}` : '',
    d.mails ? `${fr ? 'Mails importants reçus' : 'Important emails'} : ${d.mails}` : '',
    d.chats ? `${fr ? 'Messages à Gilbert' : 'Messages to Gilbert'} : ${d.chats}` : '',
  ].filter(Boolean);
}

/** Un jour sans rien de notable (moins de 10 min devant l'écran, rien de fait) */
export function dayIsEmpty(d: JournalDay | undefined) {
  if (!d) return true;
  const minutes = Object.values(d.apps).reduce((a, b) => a + b, 0);
  return minutes < 10 && !d.focus.sessions && !d.done.length;
}

/** La note du soir : 3 lignes, à la deuxième personne */
export async function writeDayNote(brain: Brain, j: Journal, key: string, lang: Lang) {
  const facts = dayFacts(j, key, lang);
  if (dayIsEmpty(j.data.days[key])) return '';
  const out = await brain.compose([
    lang === 'fr'
      ? 'Écris le carnet de bord de la journée de ton humain en 3 lignes courtes (15 mots max chacune), en le tutoyant : ce qu’il a fait, sa concentration, une petite remarque. Factuel, une pointe d’humour. Rien d’autre que ces informations.'
      : `Write your human's logbook for the day in 3 short lines (15 words max each), ${SPEAK[lang]}: what they did, their focus, a small remark. Factual, a touch of humour. Nothing but this information.`,
    '',
    ...facts,
  ].join('\n'), 160);
  return toBubbles(out ?? '').slice(0, 3).join('\n');
}

/** Le résumé de la semaine (lundi `monday`) : 2 à 4 bulles */
export async function writeWeek(brain: Brain, j: Journal, monday: string, lang: Lang) {
  const days: string[] = [];
  let total = 0, sessions = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(`${monday}T12:00`);
    d.setDate(d.getDate() + i);
    const key = isoDay(d);
    const day = j.data.days[key];
    if (dayIsEmpty(day)) continue;
    total += day!.focus.minutes;
    sessions += day!.focus.sessions;
    days.push(...dayFacts(j, key, lang), day!.note ? `Note : ${day!.note.replace(/\n/g, ' / ')}` : '', '');
  }
  if (!days.length) return null;
  const fr = lang === 'fr';
  const out = await brain.compose([
    fr
      ? `Fais à ton humain le résumé de sa semaine en 2 à 4 bulles, une par ligne, 25 mots maximum chacune, sans puces : ce qu’il a fait, son temps de concentration (${total} min en ${sessions} sessions), son meilleur jour, et un encouragement drôle pour la suite. Rien d’autre que ces informations.`
      : `Give your human a summary of their week in 2 to 4 bubbles, one per line, at most 25 words each, no bullets, ${SPEAK[lang]}: what they did, their focus time (${total} min in ${sessions} sessions), their best day, and a funny encouragement. Nothing but this information.`,
    '',
    ...days,
  ].join('\n'), 260);
  const bubbles = toBubbles(out ?? '').slice(0, 4);
  return bubbles.length ? bubbles : null;
}
