// Ce que le cerveau retient en discutant.
// Le modèle extrait l'information en JSON (format imposé), la mémoire la range.
// Chaque consigne contient un exemple : sans lui, le modèle rend trop souvent une liste vide.

import type { Lang, Memory } from '../../shared/types';
import type { MemoryStore } from '../memory';
import type { Brain } from './brain';

const str = { type: 'string' } as const;
const obj = (properties: Record<string, object>) => ({ type: 'object', properties, required: Object.keys(properties) });
const list = (items: object) => ({ type: 'array', items });

/** Consigne + exemple(s) + texte, dans la langue de l'humain */
function task(lang: Lang, fr: string[], en: string[], label: { fr: string; en: string }, text: string) {
  const lines = lang === 'fr' ? fr : en;
  // en vietnamien : consignes en anglais, souvenirs écrits en vietnamien
  if (lang === 'vi') lines.push('Write "fact" and "notice" in Vietnamese; "notice" addresses them as « cậu ».');
  return `${lines.join('\n')}\n\n${lang === 'fr' ? label.fr : label.en} : ${text}`;
}

/**
 * Après un échange : y a-t-il quelque chose de durable à retenir sur l'humain ?
 * Renvoie les nouveaux souvenirs, sous la forme à afficher (« tu détestes les réunions du lundi »).
 */
export async function learn(brain: Brain, memory: MemoryStore, question: string, _answer: string, lang: Lang) {
  if (question.trim().length < 8) return [];
  const known = memoryDigest(memory.data);
  const today = new Date().toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const r = await brain.extract<{ facts: { fact: string; notice: string }[] }>(task(lang,
    [
      "Voici un message d'un humain à son assistant. Repère au plus 2 informations sur l'humain qui pourront servir plus tard :",
      'goûts, habitudes (même « en ce moment »), projets en cours, événements à venir, proches, travail, études, santé, ce qui le stresse ou le motive.',
      `Un événement à venir garde sa date : on est le ${today}, écris la date en clair (« jeudi 29 octobre »), jamais « demain » ni « jeudi » seul.`,
      'Ignore les simples questions, les politesses, et ce qui est déjà connu.',
      '« fact » = phrase courte sans pronom, « notice » = la même chose en tutoyant.',
      'Exemple : « Je bois mon café sans sucre » → {"facts":[{"fact":"Boit son café sans sucre","notice":"tu bois ton café sans sucre"}]}',
      'Exemple : « J’ai un oral lundi, je flippe » → {"facts":[{"fact":"A un oral le lundi 2 novembre, et ça le stresse","notice":"tu as un oral lundi 2 novembre"}]}',
      'Exemple : « Quelle heure est-il ? » → {"facts":[]}',
      known ? `Déjà connu :\n${known}` : '',
    ],
    [
      "Here is a message from a human to their assistant. Find at most 2 facts about the human that will be useful later:",
      'tastes, habits (even "these days"), ongoing projects, upcoming events, close ones, work, studies, health, what stresses or motivates them.',
      `An upcoming event keeps its date: today is ${today}, write the date in full ("Thursday 29 October"), never "tomorrow" or a bare "Thursday".`,
      'Ignore plain questions, small talk, and anything already known.',
      '"fact" = short sentence without pronoun, "notice" = the same addressed to them.',
      'Example: "I take my coffee without sugar" → {"facts":[{"fact":"Takes coffee without sugar","notice":"you take your coffee without sugar"}]}',
      'Example: "I have an exam on Monday, freaking out" → {"facts":[{"fact":"Has an exam on Monday 2 November, and is stressed about it","notice":"you have an exam on Monday 2 November"}]}',
      'Example: "What time is it?" → {"facts":[]}',
      known ? `Already known:\n${known}` : '',
    ],
    { fr: 'Message', en: 'Message' }, question),
    obj({ facts: list(obj({ fact: str, notice: str })) }));
  const found = (r?.facts ?? []).slice(0, 2).filter((f) => f.fact?.trim());
  const added = new Set(memory.addFacts(found.map((f) => f.fact), 'conversation'));
  return found.filter((f) => added.has(f.fact.trim())).map((f) => f.notice.trim() || f.fact.trim());
}

function memoryDigest(m: Memory) {
  const p = m.profile;
  return [
    p.name && `- prénom : ${p.name}`,
    p.nickname && `- surnom : ${p.nickname}`,
    p.job && `- métier : ${p.job}`,
    p.city && `- ville : ${p.city}`,
    p.fuel && `- carburant : ${p.fuel}`,
    p.goal && `- objectif : ${p.goal}`,
    ...m.people.map((x) => `- proche : ${x.name} (${x.relation})`),
    ...m.facts.slice(-40).map((f) => `- ${f.text}`),
  ].filter(Boolean).join('\n');
}
