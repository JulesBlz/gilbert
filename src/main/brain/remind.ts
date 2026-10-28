// « Rappelle-moi d'appeler Paul demain à 10 h » : le cerveau en tire quoi, quel jour, quelle heure.
// Le rappel devient une échéance du carnet, rappelée à l'heure dite (ou le matin s'il n'y a pas d'heure).

import { LOCALE, type Lang } from '../../shared/types';
import type { Brain } from './brain';

/** Un message qui ressemble à une demande de rappel (le cerveau confirme ensuite) */
export const REMIND = /rappelle[- ]?moi|rappelle-le moi|fais[- ]moi penser|n['’]oublie pas de me|pense à me (dire|rappeler)|remind me|don['’]t let me forget|nhắc (tớ|mình|tôi|em|anh|chị)|nhắc nhở/i;

const str = { type: 'string' } as const;
const SCHEMA = {
  type: 'object',
  properties: { rappel: { type: 'boolean' }, quoi: str, date: str, heure: str },
  required: ['rappel', 'quoi', 'date', 'heure'],
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export interface Reminder { what: string; due: string; time: string }

/** Les jours de la semaine (0 = dimanche), en français, anglais et vietnamien */
const WEEKDAYS: [RegExp, number][] = [
  [/\b(dimanche|sunday)\b|chủ nhật/i, 0], [/\b(lundi|monday)\b|thứ (hai|2)\b/i, 1], [/\b(mardi|tuesday)\b|thứ (ba|3)\b/i, 2],
  [/\b(mercredi|wednesday)\b|thứ (tư|4)\b/i, 3], [/\b(jeudi|thursday)\b|thứ (năm|5)\b/i, 4], [/\b(vendredi|friday)\b|thứ (sáu|6)\b/i, 5],
  [/\b(samedi|saturday)\b|thứ (bảy|7)\b/i, 6],
];

/**
 * « Vendredi » tout seul : le plus proche à venir (le modèle saute parfois une semaine).
 * Seulement si le message ne donne pas de date en chiffres.
 */
function nearestWeekday(text: string, time: string, now: Date) {
  if (/\d{1,2}\s*(\/|\.|-|er\b|janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|tháng)/i.test(text)) return null;
  const found = WEEKDAYS.filter(([re]) => re.test(text));
  if (found.length !== 1) return null;
  const d = new Date(now);
  let ahead = (found[0][1] - now.getDay() + 7) % 7;
  // aujourd'hui même : seulement si l'heure n'est pas encore passée
  if (ahead === 0 && (!time || time <= `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)) ahead = 7;
  d.setDate(d.getDate() + ahead);
  return iso(d);
}

export async function parseReminder(brain: Brain, text: string, lang: Lang, now = new Date()): Promise<Reminder | null> {
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  // le calendrier des 15 prochains jours : le modèle se trompe en calculant les jours de la semaine
  const days = Array.from({ length: 15 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    // le jour en français et en anglais (et en vietnamien) : le message peut être dans l'une ou l'autre
    const names = [...new Set(['fr-FR', 'en-GB', LOCALE[lang]].map((l) => d.toLocaleDateString(l, { weekday: 'long' })))];
    return `${names.join('/')} ${iso(d)}`;
  }).join(', ');
  const task = [
    'Ton humain te demande peut-être de lui rappeler quelque chose. Si c’est le cas, « rappel » = true et :',
    `- « quoi » : ce qu’il doit faire, court, à l’infinitif ou en quelques mots (dans la langue du message${lang === 'vi' ? ', vietnamien' : ''}) ;`,
    '- « date » : le jour, au format AAAA-MM-JJ ;',
    '- « heure » : HH:MM sur 24 h, ou "" s’il n’a pas donné d’heure (« ce soir » = 19:00, « ce midi » = 12:00, « demain matin » = 09:00).',
    `Nous sommes ${days.split(', ')[0]}, il est ${hm}. « Dans 20 minutes » se calcule depuis maintenant. Calendrier : ${days}.`,
    'Sans jour précis : aujourd’hui si l’heure n’est pas passée, sinon demain.',
    'Un jour de la semaine seul (« vendredi », « Friday », « thứ Sáu ») = le PLUS PROCHE à venir dans le calendrier, jamais celui de la semaine suivante.',
    'Exemple : « rappelle-moi d’appeler Paul demain à 10h » → {"rappel":true,"quoi":"appeler Paul","date":"<demain>","heure":"10:00"}',
    'Exemple : « tu te rappelles de mon frère ? » → {"rappel":false,"quoi":"","date":"","heure":""}',
    '',
    `Message : ${text}`,
  ].join('\n');
  const r = await brain.extract<{ rappel: boolean; quoi: string; date: string; heure: string }>(task, SCHEMA);
  if (!r?.rappel || !r.quoi.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return null;
  const time = /^\d{1,2}:\d{2}$/.test(r.heure) ? r.heure.padStart(5, '0') : '';
  // une date passée est forcément une erreur de calcul
  if (r.date < iso(now)) return null;
  return { what: r.quoi.trim().replace(/[.!]$/, ''), due: nearestWeekday(text, time, now) ?? r.date, time };
}

/** « appeler Paul », demain à 10:00 */
export function describeReminder(r: Reminder, lang: Lang, now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const words = { fr: ["aujourd'hui", 'demain', 'à'], en: ['today', 'tomorrow', 'at'], vi: ['hôm nay', 'ngày mai', 'lúc'] }[lang];
  const day = r.due === iso(now) ? words[0] : r.due === iso(tomorrow) ? words[1]
    : new Date(`${r.due}T12:00`).toLocaleDateString(LOCALE[lang], { weekday: 'long', day: 'numeric', month: 'long' });
  return `« ${r.what} », ${day}${r.time ? ` ${words[2]} ${r.time}` : ''}`;
}
