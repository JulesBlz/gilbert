// Par-dessus ton épaule : le cerveau local lit le texte de ta fenêtre et cherche une vraie erreur
// (message d'échec, faute flagrante dans ce que tu écris, date qui ne colle pas, pièce jointe oubliée).
// Il doit recopier le passage en cause : s'il n'est pas vraiment à l'écran, la remarque est jetée.

import { LOCALE, SPEAK, type Lang } from '../../shared/types';
import type { Brain } from './brain';

export type Problem = 'aucun' | 'erreur' | 'faute' | 'incoherence' | 'oubli';

export interface Detection {
  problem: Problem;
  /** Passage exact de l'écran qui pose problème */
  quote: string;
  sure: boolean;
  /** Ce que Gilbert dit du problème */
  remark: string;
  /** Petite vanne sur ce que tu fais, indépendante de tout problème */
  quip: string;
}

const str = { type: 'string' } as const;
const SCHEMA = {
  type: 'object',
  properties: {
    probleme: { enum: ['aucun', 'erreur', 'faute', 'incoherence', 'oubli'] },
    extrait: str,
    certitude: { enum: ['certain', 'probable', 'doute'] },
    remarque: str,
    vanne: str,
  },
  required: ['probleme', 'extrait', 'certitude', 'remarque', 'vanne'],
};

/** Texte comparable : minuscules, sans accents ni ponctuation, espaces simples */
export function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export async function detectProblem(brain: Brain, glance: { app: string; title: string; text: string }, lang: Lang, now = new Date()): Promise<Detection | null> {
  const locale = LOCALE[lang];
  const today = now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  // le modèle se trompe en calculant les jours de la semaine : on lui donne le calendrier
  const days = Array.from({ length: 21 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - 3 + i);
    return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  }).join(', ');
  const where = `${glance.app}${glance.title ? ` — « ${glance.title} »` : ''}`;
  const task = [
    `Tu regardes par-dessus l'épaule de ton humain. Voici le texte lu dans la fenêtre au premier plan (${where}).`,
    'La lecture est automatique : elle peut contenir de petites erreurs de reconnaissance (lettres mal lues, mots coupés, menus en vrac). Ne les compte jamais comme des fautes.',
    'Cherche UNE vraie erreur qu’il est en train de faire, qui mérite d’être signalée maintenant :',
    '- « erreur » : un message d’erreur ou d’échec affiché (compilation, commande, test, paiement refusé, envoi impossible…) ;',
    '- « faute » : une faute de frappe flagrante dans un texte qu’il rédige lui-même (mail, message, document), pas dans l’interface de l’appli ;',
    `- « incoherence » : un jour de la semaine qui ne correspond pas à la date, une heure ou un montant qui ne colle pas. Nous sommes le ${today}. Calendrier : ${days}. Une date à venir dont le jour est juste n'est PAS un problème ;`,
    '- « oubli » : un mail qui annonce une pièce jointe absente, un objet vide, un « [prénom] » laissé tel quel…',
    'Presque toujours, il n’y a rien : réponds « aucun ». Au moindre doute : « aucun », ou certitude « doute ».',
    '« extrait » : le passage exact qui pose problème, recopié mot pour mot du texte (vide si aucun).',
    `« remarque » : ce que tu lui dis, ${SPEAK[lang]}, 20 mots maximum, précis (quoi corriger), une pointe d’humour si ça passe (vide si aucun).`,
    `« vanne » : quoi qu’il arrive, une remarque taquine de 15 mots maximum sur ce qu’il est en train de faire, ${SPEAK[lang]}, sans citer de nom, de chiffre ni de donnée personnelle.`,
    '',
    'Exemple : texte « Bonjour Paul, ci-joint le devis. Bonne journée » sans aucun fichier joint → {"probleme":"oubli","extrait":"ci-joint le devis","certitude":"certain","remarque":"Tu dis « ci-joint » mais je ne vois aucune pièce jointe. Le devis s’est caché ?","vanne":"…"}',
    '',
    'Texte de la fenêtre :',
    '"""',
    glance.text,
    '"""',
  ].join('\n');
  const r = await brain.extract<{ probleme: Problem; extrait: string; certitude: string; remarque: string; vanne: string }>(task, SCHEMA);
  if (!r) return null;
  return {
    problem: r.probleme,
    quote: r.extrait.trim(),
    sure: r.certitude === 'certain',
    remark: r.remarque.trim(),
    quip: r.vanne.replace(/^[.…\s]+$/, '').trim(),
  };
}

/** La remarque vaut d'être dite : problème certain, et le passage cité est vraiment à l'écran */
export function worthSaying(d: Detection, text: string) {
  if (d.problem === 'aucun' || !d.sure || !d.remark) return false;
  const quote = normalize(d.quote);
  return quote.length >= 4 && normalize(text).includes(quote);
}
