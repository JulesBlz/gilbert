// Tri d'un mail par le cerveau local : important, normal ou bruit ; résumé d'une ligne ;
// échéance éventuelle (« avant vendredi » → une vraie date). Rien ne quitte la machine.

import { LOCALE, type Lang, type Memory } from '../../shared/types';
import type { IncomingMail } from '../mail';
import type { Brain } from './brain';

export interface Triage {
  importance: 'important' | 'normal' | 'bruit';
  summary: string;
  /** Une vraie personne attend une réponse de ton humain */
  needsReply: boolean;
  deadline: { what: string; date: string; time: string } | null;
}

const str = { type: 'string' } as const;
const SCHEMA = {
  type: 'object',
  properties: {
    importance: { enum: ['important', 'normal', 'bruit'] },
    summary: str,
    reponse: { type: 'boolean' },
    deadline: { type: 'object', properties: { what: str, date: str, time: str }, required: ['what', 'date', 'time'] },
  },
  required: ['importance', 'summary', 'reponse', 'deadline'],
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function triageMail(brain: Brain, memory: Memory, mail: IncomingMail, lang: Lang): Promise<Triage> {
  const today = new Date();
  const weekday = today.toLocaleDateString(LOCALE[lang], { weekday: 'long' });
  const p = memory.profile;
  const about = [p.job && `métier : ${p.job}`, memory.people.length && `proches : ${memory.people.map((x) => `${x.name} (${x.relation})`).join(', ')}`]
    .filter(Boolean).join(' ; ');

  const task = [
    "Tu tries un mail reçu par ton humain, pour savoir s'il faut le prévenir tout de suite.",
    '« important » : une vraie personne qui lui écrit à lui et attend quelque chose (réponse, rendez-vous, document), un proche,',
    'un problème urgent (paiement refusé, sécurité du compte, livraison bloquée). « normal » : utile mais rien ne presse',
    '(confirmation, facture, notification d’un service qu’il utilise). « bruit » : publicité, lettre d’information, promotion.',
    '« summary » : en une phrase de 15 mots maximum, ce que le mail dit ou demande, en tutoyant ton humain',
    `(ex. « Camille te demande si tu viens samedi »). Langue du résumé : ${{ fr: 'français', en: 'anglais', vi: 'vietnamien (tu appelles ton humain « cậu »)' }[lang]}.`,
    '« reponse » : true seulement si une vraie personne lui pose une question ou attend une réponse écrite de sa part.',
    "« deadline » : si le mail fixe une date limite ou un rendez-vous à ton humain, « what » = quoi en quelques mots,",
    `« date » = AAAA-MM-JJ, « time » = HH:MM ou vide. Sinon, tout vide. Nous sommes le ${weekday} ${iso(today)}.`,
    'Exemple : « Peux-tu m’envoyer le devis avant vendredi ? » → {"importance":"important","summary":"Paul attend ton devis avant vendredi","reponse":true,'
      + `"deadline":{"what":"Envoyer le devis à Paul","date":"AAAA-MM-JJ du vendredi","time":""}}`,
    about ? `Ce que tu sais de ton humain : ${about}.` : null,
    '',
    `De : ${mail.from} <${mail.fromAddress}>${mail.bulk ? ' (envoi de masse)' : ''}`,
    `Objet : ${mail.subject}`,
    `Texte : ${mail.text.slice(0, 1200)}`,
  ].filter((l) => l !== null).join('\n');

  const r = await brain.extract<{ importance: Triage['importance']; summary: string; reponse: boolean; deadline: { what: string; date: string; time: string } }>(task, SCHEMA);
  if (!r) return { importance: mail.bulk ? 'bruit' : 'normal', summary: mail.subject, needsReply: false, deadline: null };

  const d = r.deadline;
  const validDate = d && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.date >= iso(today) && d.what.trim();
  return {
    importance: r.importance,
    summary: r.summary.trim() || mail.subject,
    needsReply: Boolean(r.reponse) && !mail.bulk && r.importance !== 'bruit',
    deadline: validDate ? { what: d.what.trim(), date: d.date, time: /^\d{2}:\d{2}$/.test(d.time) ? d.time : '' } : null,
  };
}
