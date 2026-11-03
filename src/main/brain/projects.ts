// Ce que le cerveau local tire des mails et de l'écran pour les fiches de projet : de quel projet parle un mail
// (pour proposer d'en créer une), et ce qu'une fenêtre montre de neuf sur un projet suivi. Rien ne quitte la machine.

import type { Lang, Project } from '../../shared/types';
import type { Brain } from './brain';

const str = { type: 'string' } as const;
const SPEAK: Record<Lang, string> = { fr: 'en français', en: 'in English', vi: 'bằng tiếng Việt' };
const iso = (d: Date) => d.toLocaleDateString('sv');

/** Un mail important qui ne rentre dans aucune fiche : fait-il partie d'un projet précis ? */
export async function projectIdea(brain: Brain, mail: { from: string; subject: string; summary: string }, lang: Lang) {
  const r = await brain.extract<{ projet: string; mots: string[] }>([
    'Tu lis le résumé d\'un mail reçu par ton humain. Dis s\'il fait partie d\'un projet de travail ou de vie précis et durable',
    '(un chantier, un client, un dossier, un voyage, un événement à préparer), pas d\'une simple conversation, d\'une facture ou d\'une notification.',
    '« projet » : un nom court de 1 à 4 mots (ex. « Refonte du site », « Déménagement »), ou vide si ce n\'est pas un projet.',
    '« mots » : 1 à 3 mots-clés propres à ce projet (un nom de client, un mot de l\'objet), jamais un mot courant.',
    `Langue : ${SPEAK[lang]}.`,
    '', `De : ${mail.from}`, `Objet : ${mail.subject}`, `Résumé : ${mail.summary}`,
  ].join('\n'), { type: 'object', properties: { projet: str, mots: { type: 'array', items: str } }, required: ['projet', 'mots'] });
  const name = r?.projet?.trim() ?? '';
  return name.length >= 3 && name.length <= 60 ? { name, keywords: (r?.mots ?? []).map((k) => k.trim()).filter((k) => k.length >= 3).slice(0, 3) } : null;
}

/** Ce que la fenêtre au premier plan apprend de neuf sur ce projet : une info à garder, une chose à ne pas oublier */
export async function screenInsight(brain: Brain, p: Project, screen: { app: string; title: string; text: string }, lang: Lang) {
  const r = await brain.extract<{ info: string; todo: string; date: string }>([
    `Ton humain suit le projet « ${p.name} »${p.description ? ` (${p.description})` : ''}. Voici ce qu'il a à l'écran.`,
    '« info » : UNE phrase de 20 mots maximum pour une information vraiment importante et précise sur ce projet (décision, chiffre, date, demande, problème).',
    'Si ce n\'est que du texte ordinaire, une liste de fichiers, un menu ou rien de précis : vide. N\'invente rien, ne recopie pas d\'éléments personnels sensibles.',
    '« todo » : une chose à ne pas oublier qui apparaît clairement à l\'écran (verbe à l\'infinitif, 10 mots maximum), sinon vide ; « date » : sa date limite AAAA-MM-JJ si elle est écrite, sinon vide.',
    `Langue : ${SPEAK[lang]}. Nous sommes le ${iso(new Date())}.`,
    p.todos.length ? `Déjà dans sa liste : ${p.todos.filter((t) => !t.done).slice(0, 6).map((t) => t.text).join(' ; ')}` : '',
    '', `Appli : ${screen.app}`, `Fenêtre : ${screen.title}`, `Texte :\n${screen.text.slice(0, 1800)}`,
  ].filter(Boolean).join('\n'), { type: 'object', properties: { info: str, todo: str, date: str }, required: ['info', 'todo', 'date'] });
  if (!r) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.date >= iso(new Date()) ? r.date : '';
  return { info: r.info.trim(), todo: r.todo.trim(), date };
}

/** Le petit rapport d'avancement d'un projet : trois phrases tirées de sa description, de ses infos et de ses cases */
export async function projectReport(brain: Brain, p: Project, lang: Lang) {
  const open = p.todos.filter((t) => !t.done), done = p.todos.filter((t) => t.done);
  const fr = lang === 'fr';
  const task = [
    fr ? `Écris le rapport d'avancement du projet « ${p.name} » en 2 à 3 phrases courtes (60 mots maximum), pour ton humain, à partir de ces seules informations.`
      : `Write the progress report of the project "${p.name}" in 2 to 3 short sentences (60 words max), for your human, using only this information.`,
    fr ? 'Dis où en est le projet, ce qui bloque ou presse, la prochaine étape. N\'invente rien : si les informations manquent, une seule phrase honnête suffit. Pas de titre, pas de puces.'
      : 'Say where the project stands, what blocks or presses, the next step. Invent nothing: if information is missing, one honest sentence is enough. No title, no bullets.',
    `${fr ? 'Écris' : 'Write'} ${SPEAK[lang]}.`,
    p.description ? `${fr ? 'Description' : 'Description'} : ${p.description}` : '',
    ...p.notes.slice(0, 8).map((n) => `- ${new Date(n.at).toLocaleDateString('sv')} : ${n.text}`),
    ...open.slice(0, 8).map((t) => `${fr ? 'À faire' : 'To do'} : ${t.text}${t.due ? ` (${t.due})` : ''}`),
    ...done.slice(-4).map((t) => `${fr ? 'Fait' : 'Done'} : ${t.text}`),
  ].filter(Boolean).join('\n');
  const out = (await brain.compose(task, 160))?.replace(/\s+/g, ' ').trim();
  return out && out.length >= 20 ? out : null;
}
