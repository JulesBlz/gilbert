// Banques de répliques, selon la langue choisie dans le menu.

import type { Lang } from '../shared/types';
import { fr, type Lines } from './lines.fr';
import { en } from './lines.en';
import { vi } from './lines.vi';

/** Les répliques de la langue courante (liaison vivante : suit `setLang`) */
export let lines: Lines = fr;
export let lang: Lang = 'fr';

export function setLang(l: Lang) {
  lang = l;
  lines = { fr, en, vi }[l];
  document.documentElement.lang = l;
}

/** Ce qui reste à dire de chaque banque : on vide le sac avant de le remplir à nouveau */
const bags = new Map<readonly string[], string[]>();
const last = new Map<readonly string[], string>();

/**
 * Tire une réplique au hasard et remplace les {variables}. Aucune réplique ne revient avant
 * que toutes les autres de la banque aient été dites, ni deux fois de suite d'un sac à l'autre.
 */
export function pick(list: readonly string[], vars: Record<string, string | number> = {}) {
  let bag = bags.get(list);
  if (!bag?.length) {
    bag = [...list].sort(() => Math.random() - 0.5);
    if (bag.length > 1 && bag[bag.length - 1] === last.get(list)) bag.unshift(bag.pop()!);
    bags.set(list, bag);
  }
  const s = bag.pop()!;
  last.set(list, s);
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

export function greeting(name = '', date = new Date()) {
  const h = date.getHours();
  const line = h >= 5 && h < 12 ? pick(lines.greetMorning)
    : h >= 12 && h < 18 ? pick(lines.greetAfternoon)
    : h >= 18 && h < 23 ? pick(lines.greetEvening)
    : pick(lines.greetNight);
  return name ? `${pick(lines.greetName, { name })} ${line}` : line;
}

/** Taille lisible d'un téléchargement : « 7,1 Go » / « 7.1 GB » */
export function formatSize(bytes: number) {
  const n = (bytes / 1e9).toFixed(1);
  return lang === 'fr' ? `${n.replace('.', ',')} Go` : lang === 'vi' ? `${n.replace('.', ',')} GB` : `${n} GB`;
}
