// La liste de choses à faire, dans la discussion, sans passer par le cerveau :
// « ajoute le devis à ma liste », « à faire : appeler la banque », « c'est fait : le devis »,
// « découpe préparer l'entretien ». Seulement en début de message, pour ne pas confondre avec une
// phrase qui en parle. Le découpage lui-même, en étapes, est écrit par le cerveau.

import type { Brain } from './brain/brain';
import type { Lang } from '../shared/types';

const ADD = [
  /^\s*(?:gilbert[\s,]*)?(?:ajoute|rajoute|mets|note)\s+(.+?)\s+(?:à|a|dans|sur)\s+(?:ma|la)\s+(?:liste|to-?do)\s*[.!]?\s*$/i,
  /^\s*(?:gilbert[\s,]*)?(?:à faire|a faire|todo|to-?do)\s*:\s*(.+?)\s*$/i,
  /^\s*(?:gilbert[\s,]*)?(?:add|put)\s+(.+?)\s+(?:to|on)\s+my\s+(?:list|to-?do(?: list)?)\s*[.!]?\s*$/i,
  /^\s*(?:gilbert[\s,]*)?thêm\s+(.+?)\s+vào\s+danh sách(?: việc)?\s*[.!]?\s*$/i,
];
const DONE = /^\s*(?:gilbert[\s,]*)?(?:c'est fait|c’est fait|j'ai fini|j’ai fini|fini|terminé|done|i(?:'ve| have)? finished|xong rồi|xong)\s*:?\s+(.+?)\s*[.!]?\s*$/i;

/** « ajoute X à ma liste » → X (avec une majuscule), ou null */
export function todoToAdd(text: string) {
  for (const re of ADD) {
    const what = text.match(re)?.[1]?.trim();
    if (what) return what.charAt(0).toUpperCase() + what.slice(1);
  }
  return null;
}

/** « c'est fait : X » → X, ou null */
export function todoDone(text: string) {
  return text.match(DONE)?.[1]?.trim() || null;
}

const SPLIT = /^\s*(?:gilbert[\s,]*)?(?:découpe|decoupe|décompose|decompose|split|break down|chia nhỏ)\s*:?\s+(.+?)\s*[.!]?\s*$/i;

/** « découpe X » → X, ou null */
export function todoSplit(text: string) {
  return text.match(SPLIT)?.[1]?.trim() || null;
}

/** 3 à 6 étapes concrètes pour venir à bout d'une tâche, dans la langue de l'humain (vide si le cerveau n'y arrive pas) */
export async function splitTask(brain: Brain, title: string, lang: Lang) {
  const language = { fr: 'en français', en: 'in English', vi: 'in Vietnamese' }[lang];
  const r = await brain.extract<{ steps: string[] }>([
    `Découpe cette tâche en 3 à 6 étapes concrètes, dans l'ordre, ${language}. Chaque étape : une action courte (8 mots au plus), qui commence par un verbe.`,
    'Exemple : « Préparer mon entretien » → {"steps":["Relire l’offre de stage","Choisir 3 projets à montrer","Préparer mes questions","Tester le trajet"]}',
    `Tâche : « ${title} »`,
  ].join('\n'), { type: 'object', properties: { steps: { type: 'array', items: { type: 'string' } } }, required: ['steps'] });
  return (r?.steps ?? []).map((x) => x.trim().replace(/^[-•\d.)\s]+/, '').slice(0, 120)).filter(Boolean).slice(0, 6);
}
