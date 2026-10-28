// Le brief du jour : à la première ouverture de la journée (ou à ton retour, si Gilbert a passé
// la nuit allumé), il te fait le point en quelques bulles : météo, agenda, échéances, mails
// importants, anniversaires, et une vanne pour finir.
// Seule la météo sort de la machine : le nom de ta ville est envoyé à Open-Meteo (gratuit, sans compte).

import { app } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Brain } from './brain/brain';
import { LOCALE, SPEAK, type CalendarEvent, type Lang, type Memory, type Task } from '../shared/types';

/** Avant cette heure, ce n'est pas encore « aujourd'hui » pour le brief */
const DAY_STARTS_AT = 5;
/** À partir de cette heure, il fait le bilan de la journée (une fois) */
const EVENING_AT = 18;
const file = () => path.join(app.getPath('userData'), 'brief.json');

interface Saved {
  /** Dernier jour où le brief a été fait (AAAA-MM-JJ) */
  lastDay: string;
  /** Ville déjà localisée, pour ne pas redemander à chaque fois */
  place: { city: string; name: string; lat: number; lon: number } | null;
  /** On lui a déjà suggéré de noter sa ville (pour la météo) */
  cityHint: boolean;
  /** Dernier jour où le bilan du soir a été fait */
  lastEvening?: string;
  /** Ce qui ne se dit qu'une fois (anniversaire préparé, fête de la rencontre…) */
  said?: string[];
}

export interface Weather {
  place: string;
  sky: string;
  min: number;
  max: number;
  rain: number;
}

export interface BriefFacts {
  now: Date;
  name: string;
  weather: Weather | null;
  calendar: boolean;
  events: CalendarEvent[];
  tasks: Task[];
  mail: boolean;
  mails: { from: string; summary: string }[];
  /** Trop de mails pour les trier un par un */
  backlog: number;
  birthdays: { name: string; relation: string; when: 'today' | 'tomorrow' }[];
}

export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Le jour « du brief » : avant 5 h du matin, on est encore la veille */
function briefDay(now = new Date()) {
  const d = new Date(now);
  if (d.getHours() < DAY_STARTS_AT) d.setDate(d.getDate() - 1);
  return isoDay(d);
}

export class BriefStore {
  private saved: Saved;

  constructor() {
    try {
      this.saved = { lastDay: '', place: null, cityHint: false, ...JSON.parse(readFileSync(file(), 'utf8')) };
    } catch {
      this.saved = { lastDay: '', place: null, cityHint: false };
    }
  }

  private save() {
    mkdirSync(path.dirname(file()), { recursive: true });
    writeFileSync(file(), JSON.stringify(this.saved, null, 2));
  }

  /** Le brief d'aujourd'hui reste à faire (et il est assez tard pour le faire) */
  due(now = new Date()) {
    return now.getHours() >= DAY_STARTS_AT && this.saved.lastDay !== briefDay(now);
  }

  done(now = new Date()) {
    this.saved.lastDay = briefDay(now);
    this.save();
  }

  /** Le bilan du soir reste à faire (à partir de 18 h) */
  eveningDue(now = new Date()) {
    return now.getHours() >= EVENING_AT && this.saved.lastEvening !== isoDay(now);
  }

  eveningDone(now = new Date()) {
    this.saved.lastEvening = isoDay(now);
    this.save();
  }

  /** Vrai la première fois seulement pour cette clé */
  once(key: string) {
    const said = (this.saved.said ??= []);
    if (said.includes(key)) return false;
    said.push(key);
    if (said.length > 200) said.splice(0, said.length - 200);
    this.save();
    return true;
  }

  /** Vrai une seule fois : le moment de lui suggérer de noter sa ville dans le carnet */
  takeCityHint() {
    if (this.saved.cityHint) return false;
    this.saved.cityHint = true;
    this.save();
    return true;
  }

  /** Météo du jour à `city` ; null si pas de ville ou pas de réseau */
  async weather(city: string, lang: Lang): Promise<Weather | null> {
    city = city.trim();
    if (!city) return null;
    try {
      let place = this.saved.place?.city === city ? this.saved.place : null;
      if (!place) {
        const q = new URLSearchParams({ name: city, count: '1', language: lang, format: 'json' });
        const geo = await getJson(`https://geocoding-api.open-meteo.com/v1/search?${q}`) as { results?: { name: string; latitude: number; longitude: number }[] };
        const hit = geo.results?.[0];
        if (!hit) return null;
        place = { city, name: hit.name, lat: hit.latitude, lon: hit.longitude };
        this.saved.place = place;
        this.save();
      }
      const q = new URLSearchParams({
        latitude: String(place.lat), longitude: String(place.lon), timezone: 'auto', forecast_days: '1',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      });
      const f = await getJson(`https://api.open-meteo.com/v1/forecast?${q}`) as {
        daily: { weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: (number | null)[] };
      };
      const d = f.daily;
      return {
        place: place.name,
        sky: sky(d.weather_code[0], lang),
        min: Math.round(d.temperature_2m_min[0]),
        max: Math.round(d.temperature_2m_max[0]),
        rain: d.precipitation_probability_max[0] ?? 0,
      };
    } catch {
      return null;
    }
  }
}

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Codes météo de l'OMM, tels que les donne Open-Meteo */
function sky(code: number, lang: Lang) {
  const fr = lang === 'fr';
  if (code === 0) return fr ? 'grand soleil' : 'clear sky';
  if (code <= 2) return fr ? 'quelques nuages' : 'a few clouds';
  if (code === 3) return fr ? 'ciel couvert' : 'overcast';
  if (code <= 48) return fr ? 'brouillard' : 'fog';
  if (code <= 57) return fr ? 'bruine' : 'drizzle';
  if (code <= 67) return fr ? 'pluie' : 'rain';
  if (code <= 77) return fr ? 'neige' : 'snow';
  if (code <= 82) return fr ? 'averses' : 'showers';
  if (code <= 86) return fr ? 'averses de neige' : 'snow showers';
  return fr ? 'orages' : 'thunderstorms';
}

/** Anniversaires (« JJ/MM ») aujourd'hui ou demain */
export function birthdays(memory: Memory, now = new Date()): BriefFacts['birthdays'] {
  const key = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const out: BriefFacts['birthdays'] = [];
  for (const p of memory.people) {
    const b = p.birthday.trim().replace(/^(\d)\//, '0$1/').replace(/\/(\d)$/, '/0$1');
    if (b === key(now)) out.push({ name: p.name, relation: p.relation, when: 'today' });
    else if (b === key(tomorrow)) out.push({ name: p.name, relation: p.relation, when: 'tomorrow' });
  }
  return out;
}

// ---------- rédaction ----------

const MAX_BUBBLES = 5;

/** Les faits, en liste, pour le modèle comme pour le brief de secours */
export function factLines(f: BriefFacts, lang: Lang) {
  const fr = lang === 'fr';
  const locale = LOCALE[lang];
  const hm = (t: number) => new Date(t).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const today = isoDay(f.now);
  const lines: string[] = [];
  const date = f.now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  lines.push(fr ? `Moment : ${date}, ${hm(f.now.getTime())}.` : `Now: ${date}, ${hm(f.now.getTime())}.`);
  if (f.name) lines.push(fr ? `Prénom de ton humain : ${f.name}.` : `Your human's name: ${f.name}.`);
  if (f.weather) {
    const w = f.weather;
    lines.push(fr
      ? `Météo à ${w.place} : ${w.sky}, de ${w.min} à ${w.max} °C, ${w.rain} % de risque de pluie.`
      : `Weather in ${w.place}: ${w.sky}, ${w.min} to ${w.max} °C, ${w.rain}% chance of rain.`);
  }
  if (f.calendar) {
    if (f.events.length) {
      lines.push(fr ? "Agenda d'aujourd'hui :" : "Today's calendar:");
      for (const e of f.events) {
        const at = e.allDay ? (fr ? 'toute la journée' : 'all day') : hm(e.start);
        lines.push(`- ${at} : ${e.title}${e.location ? ` (${e.location})` : ''}`);
      }
    } else {
      lines.push(fr ? "Agenda d'aujourd'hui : rien de prévu." : "Today's calendar: nothing planned.");
    }
  }
  if (f.tasks.length) {
    lines.push(fr ? 'Échéances proches :' : 'Upcoming deadlines:');
    for (const t of f.tasks) {
      const tomorrow = new Date(f.now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const day = t.due === today ? (fr ? "aujourd'hui" : 'today')
        : t.due === isoDay(tomorrow) ? (fr ? 'demain' : 'tomorrow')
        : new Date(`${t.due}T12:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
      lines.push(`- ${day}${t.time ? ` ${fr ? 'à' : 'at'} ${t.time}` : ''} : ${t.title}`);
    }
  }
  if (f.mails.length) {
    lines.push(fr ? 'Mails importants reçus depuis hier :' : 'Important emails since yesterday:');
    for (const m of f.mails) lines.push(`- ${m.from} : ${m.summary}`);
  } else if (f.mail) {
    lines.push(fr ? 'Mails : rien d’important depuis hier.' : 'Email: nothing important since yesterday.');
  }
  if (f.backlog) lines.push(fr ? `Il y a aussi ${f.backlog} nouveaux mails, trop pour les trier.` : `There are also ${f.backlog} new emails, too many to sort.`);
  for (const b of f.birthdays) {
    const when = b.when === 'today' ? (fr ? "aujourd'hui" : 'today') : (fr ? 'demain' : 'tomorrow');
    lines.push(fr ? `Anniversaire ${when} : ${b.name}${b.relation ? ` (${b.relation})` : ''}.` : `Birthday ${when}: ${b.name}${b.relation ? ` (${b.relation})` : ''}.`);
  }
  return lines;
}

/** Nettoie la sortie du modèle : une bulle par ligne, sans puces ni markdown */
export function toBubbles(text: string) {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/\*\*|__|`/g, '').replace(/^["«]\s*|\s*["»]$/g, '').trim())
    .filter((l) => l.length > 1 && !/^(bulle|bubble)\s*\d*\s*:?$/i.test(l))
    .map((l) => l.replace(/^(bulle|bubble)\s*\d+\s*:\s*/i, ''))
    .slice(0, MAX_BUBBLES);
}

/** Gilbert rédige le brief à partir des faits ; null si le cerveau n'y arrive pas */
export async function writeBrief(brain: Brain, f: BriefFacts, lang: Lang): Promise<string[] | null> {
  const fr = lang === 'fr';
  const hour = f.now.getHours();
  const facts = factLines(f, lang).join('\n');
  const task = fr
    ? [
        `C'est la première fois que ton humain t'ouvre aujourd'hui${hour >= 12 ? " (il n'est plus le matin, ne dis pas « ce matin »)" : ''}. Fais-lui le point du jour.`,
        `Écris de 2 à ${MAX_BUBBLES} bulles, une par ligne, 25 mots maximum chacune, sans puces ni numéros.`,
        `Bulle 1 : bonjour${f.name ? ' avec son prénom' : ''}${f.weather ? ' et la météo en quelques mots (le ciel et les températures)' : ''}.`,
        "Ensuite, dans l'ordre : ce qui l'attend aujourd'hui (agenda, échéances), les mails importants, les anniversaires.",
        'Regroupe, va à l’essentiel, donne les heures en chiffres (10 h, 14 h 30). Si une rubrique ne figure pas ci-dessous, n’en parle pas.',
        "N'invente rien : utilise uniquement ces informations.",
        'Dernière bulle : une vanne du jour, pince-sans-rire, sur sa journée ou sur toi le raton laveur. Pas de devinette, pas de « pourquoi… parce que ».',
        '',
        'Informations :',
        facts,
      ]
    : [
        `It's the first time your human opens you today${hour >= 12 ? " (it is no longer morning, don't say \"this morning\")" : ''}. Give them the day's rundown.`,
        `Write 2 to ${MAX_BUBBLES} bubbles, one per line, at most 25 words each, no bullets or numbers.`,
        `Bubble 1: hello${f.name ? ' with their name' : ''}${f.weather ? ' and the weather in a few words (sky and temperatures)' : ''}.`,
        "Then, in order: what's ahead today (calendar, deadlines), important emails, birthdays.",
        'Group things, keep it short, give times. If a topic is not listed below, do not mention it.',
        'Do not make anything up: only use this information.',
        'Last bubble: a deadpan joke of the day, about their day or about you the raccoon. No riddles, no "why… because".',
        `Write ${SPEAK[lang]}.`,
        '',
        'Information:',
        facts,
      ];
  const out = await brain.compose(task.join('\n'), 360);
  if (!out) return null;
  const bubbles = toBubbles(out);
  return bubbles.length >= 2 ? bubbles : null;
}

// ---------- bilan du soir ----------

export interface EveningFacts {
  done: string[];
  /** Encore à faire aujourd'hui */
  left: string[];
  /** Demain : rendez-vous (« 09:30 Dentiste ») et échéances */
  tomorrow: string[];
  /** Mails qui attendent ta réponse */
  waiting: string[];
  /** Sessions de travail du jour (« 3 sessions, 75 min »), vide sinon */
  focus: string;
}

export const eveningEmpty = (f: EveningFacts) => !f.done.length && !f.left.length && !f.tomorrow.length && !f.waiting.length && !f.focus;

/** Fin de journée : ce qui est fait, ce qui reste, demain ; 1 à 3 bulles. Null si le cerveau n'y arrive pas */
export async function writeEvening(brain: Brain, f: EveningFacts, lang: Lang): Promise<string[] | null> {
  const fr = lang === 'fr';
  const list = (label: string, items: string[]) => (items.length ? [`${label} :`, ...items.map((x) => `- ${x}`)] : []);
  const task = [
    ...(fr
      ? ['La journée de ton humain se termine. Fais-lui le bilan en 1 à 3 bulles, une par ligne, 25 mots maximum chacune, sans puces.',
        'Félicite brièvement ce qui est fait, rappelle ce qui reste, annonce demain. Rien d’autre que ces informations. Une petite vanne à la fin si ça passe.']
      : ['Your human’s day is ending. Give them the wrap-up in 1 to 3 bubbles, one per line, at most 25 words each, no bullets.',
        'Briefly praise what’s done, mention what’s left, announce tomorrow. Nothing but this information. A tiny joke at the end if it fits.']),
    `${fr ? 'Écris' : 'Write'} ${SPEAK[lang]}.`,
    '',
    ...list(fr ? 'Fait aujourd’hui' : 'Done today', f.done),
    ...list(fr ? 'Concentration' : 'Focus', f.focus ? [f.focus] : []),
    ...list(fr ? 'Reste à faire aujourd’hui' : 'Still to do today', f.left),
    ...list(fr ? 'Demain' : 'Tomorrow', f.tomorrow),
    ...list(fr ? 'Mails qui attendent sa réponse' : 'Emails waiting for a reply', f.waiting),
  ].join('\n');
  const out = await brain.compose(task, 220);
  const bubbles = out ? toBubbles(out).slice(0, 3) : [];
  return bubbles.length ? bubbles : null;
}

export function plainEvening(f: EveningFacts, lang: Lang): string[] {
  const fr = lang === 'fr';
  const out: string[] = [];
  if (f.done.length) out.push((fr ? 'Bilan : fait aujourd’hui, ' : 'Wrap-up: done today, ') + f.done.join(', ') + '.');
  if (f.focus) out.push((fr ? 'Concentration : ' : 'Focus: ') + f.focus + '.');
  if (f.left.length) out.push((fr ? 'Il reste : ' : 'Still left: ') + f.left.join(', ') + '.');
  if (f.tomorrow.length) out.push((fr ? 'Demain : ' : 'Tomorrow: ') + f.tomorrow.join(', ') + '.');
  if (f.waiting.length) out.push((fr ? 'Ils attendent ta réponse : ' : 'Waiting for your reply: ') + f.waiting.join(', ') + '.');
  return out;
}

// ---------- récap d'absence ----------

/** Pourquoi il a gardé ses messages : tu étais absent, en mode Chut, ou en session de travail */
export type Held = 'away' | 'quiet' | 'focus';
const RECAP_START: Record<Held, Record<Lang, string>> = {
  away: { fr: 'Pendant ton absence', en: 'While you were away', vi: 'Trong lúc cậu vắng mặt' },
  quiet: { fr: 'Pendant que je me taisais', en: 'While I was quiet', vi: 'Trong lúc tớ im lặng' },
  focus: { fr: 'Pendant ta session', en: 'During your session', vi: 'Trong lúc cậu làm việc' },
};

/**
 * Ce qui s'est passé pendant ton absence (ou ton mode Chut), en 1 à 3 bulles. `facts` : une ligne
 * par événement, avec son heure. Null si le cerveau n'y arrive pas.
 */
export async function writeRecap(brain: Brain, facts: string[], why: Held, since: number, lang: Lang): Promise<string[] | null> {
  const fr = lang === 'fr';
  const from = new Date(since).toLocaleTimeString(LOCALE[lang], { hour: '2-digit', minute: '2-digit' });
  const now = new Date().toLocaleTimeString(LOCALE[lang], { hour: '2-digit', minute: '2-digit' });
  const task = fr
    ? [
        { quiet: `Tu étais en mode Chut depuis ${from} ; il est ${now}, tu as de nouveau le droit de parler.`,
          focus: `Ton humain vient de finir une session de travail commencée à ${from} (il est ${now}) ; tu as gardé ces messages pour ne pas le déranger.`,
          away: `Ton humain revient devant son écran (il était absent depuis ${from} environ ; il est ${now}).` }[why],
        'Voici ce qui est arrivé entre-temps, dans l’ordre :',
        ...facts.map((f) => `- ${f}`),
        '',
        `Fais-lui le récap en 1 à 3 bulles, une par ligne, 25 mots maximum chacune, sans puces ni numéros. Commence par « ${RECAP_START[why].fr} ».`,
        'Regroupe (ex. deux mails), mais n’en oublie aucune ; heures en chiffres (17 h, 14 h 30). Un rendez-vous dont l’heure est passée a commencé sans lui : dis-le.',
        "N'invente rien : seulement ces informations. Pas de vanne, sauf une toute petite à la fin si ça passe.",
      ]
    : [
        { quiet: `You were in quiet mode since ${from}; it is ${now}, you may talk again.`,
          focus: `Your human just finished a work session that started at ${from} (it is ${now}); you held these messages so as not to disturb them.`,
          away: `Your human is back at their screen (away since about ${from}; it is ${now}).` }[why],
        'Here is what happened meanwhile, in order:',
        ...facts.map((f) => `- ${f}`),
        '',
        `Give them the recap in 1 to 3 bubbles, one per line, at most 25 words each, no bullets or numbers, ${SPEAK[lang]}. Start with "${RECAP_START[why][lang]}".`,
        'Group things (e.g. two emails) but leave none out; times in digits. An appointment whose time has passed started without them: say so.',
        'Do not make anything up: only this information. No joke, except a tiny one at the end if it fits.',
      ];
  const out = await brain.compose(task.join('\n'), 240);
  const bubbles = out ? toBubbles(out).slice(0, 3) : [];
  return bubbles.length ? bubbles : null;
}

/** Récap sans le cerveau : la liste, deux faits par bulle */
export function plainRecap(facts: string[], why: Held, lang: Lang): string[] {
  const intro = `${RECAP_START[why][lang]}${lang === 'fr' ? ' :' : ':'}`;
  const out: string[] = [];
  for (let i = 0; i < facts.length; i += 2) out.push(facts.slice(i, i + 2).join(' · '));
  out[0] = `${intro} ${out[0]}`;
  return out.slice(0, MAX_BUBBLES);
}

/** Brief sans le cerveau (pas encore téléchargé, ou en panne) : sobre mais complet */
export function plainBrief(f: BriefFacts, lang: Lang): string[] {
  const fr = lang === 'fr';
  const locale = LOCALE[lang];
  const hm = (t: number) => new Date(t).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const out: string[] = [];
  const hello = fr ? `Salut${f.name ? ` ${f.name}` : ''} !` : `Hi${f.name ? ` ${f.name}` : ''}!`;
  const w = f.weather;
  out.push(w
    ? (fr ? `${hello} À ${w.place} : ${w.sky}, ${w.min} à ${w.max} °C${w.rain >= 40 ? `, ${w.rain} % de risque de pluie` : ''}.` : `${hello} In ${w.place}: ${w.sky}, ${w.min} to ${w.max} °C${w.rain >= 40 ? `, ${w.rain}% chance of rain` : ''}.`)
    : (fr ? `${hello} Le point du jour.` : `${hello} Here's your day.`));
  if (f.calendar) {
    out.push(f.events.length
      ? (fr ? 'Au programme : ' : 'On the agenda: ') + f.events.map((e) => `${e.allDay ? '' : `${hm(e.start)} `}${e.title}`).join(', ') + '.'
      : (fr ? "Rien dans ton agenda aujourd'hui." : 'Nothing in your calendar today.'));
  }
  if (f.tasks.length) out.push((fr ? 'Échéances : ' : 'Deadlines: ') + f.tasks.map((t) => t.title).join(', ') + '.');
  if (f.mails.length) out.push((fr ? `${f.mails.length} mail${f.mails.length > 1 ? 's' : ''} important${f.mails.length > 1 ? 's' : ''} : ` : `${f.mails.length} important email${f.mails.length > 1 ? 's' : ''}: `) + f.mails.map((m) => m.from).join(', ') + '.');
  for (const b of f.birthdays) {
    out.push(fr ? `N'oublie pas : anniversaire de ${b.name} ${b.when === 'today' ? "aujourd'hui" : 'demain'}.` : `Don't forget: ${b.name}'s birthday ${b.when}.`);
  }
  return out.slice(0, MAX_BUBBLES);
}
