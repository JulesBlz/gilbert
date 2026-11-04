// Les icônes du menu : Pixelarticons (pixel-art, 24 × 24, licence MIT, https://pixelarticons.com), en
// variantes « sharp » (angles droits). Seules sont retenues celles dont chaque trait tombe exactement sur une
// grille de 2 px (vérifié : un test de rastérisation les ramène à 12 × 12 sans perte), pour avoir le même pixel
// que le texte et les contours. À 24 px, un pixel d'icône fait donc 2 px. Elles prennent la couleur du texte.

import calendar from 'pixelarticons/svg/calendar-sharp.svg';
import chat from 'pixelarticons/svg/message-text-sharp.svg';
import guide from 'pixelarticons/svg/sparkles.svg';
import shop from 'pixelarticons/svg/shopping-bag-sharp.svg';
import journal from 'pixelarticons/svg/chart-line-sharp.svg';
import carnet from 'pixelarticons/svg/notes-sharp.svg';
import settings from 'pixelarticons/svg/settings-cog-2.svg';
import plug from 'pixelarticons/svg/mail-sharp.svg';
import projects from 'pixelarticons/svg/briefcase-sharp.svg';
import back from 'pixelarticons/svg/arrow-left.svg';

const ICONS = { calendar, chat, guide, shop, journal, carnet, settings, plug, back, projects } as const;
/** Décalage (en unités de l'icône) qui ramène ses traits sur la grille de 2 px de la page ; mesuré à la rastérisation */
const SHIFT: Partial<Record<keyof typeof ICONS, [number, number]>> = { calendar: [1, 0], guide: [1, 1], shop: [1, 0], back: [0, 1] };
export type IconName = keyof typeof ICONS | 'stop';

/** Le carré de « arrêter » (Pixelarticons n'en a pas de plein) */
const STOP = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>';

/** Une icône Pixelarticons, à la couleur du texte ; 24 px = des pixels de 2 px, comme le reste de l'interface */
export function icon(name: IconName, size = 24) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.innerHTML = name === 'stop' ? STOP : ICONS[name];
  const svg = span.querySelector('svg')!;
  const [dx, dy] = (name !== 'stop' && SHIFT[name]) || [0, 0];
  svg.setAttribute('viewBox', `${dx} ${dy} 24 24`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  return span;
}

export const TAB_ICONS = { home: 'calendar', chat: 'chat', guide: 'guide', shop: 'shop', journal: 'journal', carnet: 'carnet', projects: 'projects' } as const;
export const GEAR_TAB_ICONS = { general: 'settings', connections: 'plug', back: 'back' } as const;

/** Une petite grille de « X » en SVG net (la coche des cases) */
export function pixels(grid: readonly string[], scale: number) {
  const d = grid.flatMap((row, y) => [...row.matchAll(/X+/g)].map((m) => `M${m.index} ${y}h${m[0].length}v1h-${m[0].length}z`)).join('');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${grid[0].length} ${grid.length}`);
  svg.setAttribute('width', String(grid[0].length * scale));
  svg.setAttribute('height', String(grid.length * scale));
  svg.setAttribute('shape-rendering', 'crispEdges');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

/**
 * Les petites icônes (plus, corbeille, copier, cadenas, croix) : dessinées à la main, une case = 2 px,
 * comme le texte et les contours. `X` : plein.
 */
export const TINY = {
  plus: ['...X...', '...X...', '...X...', 'XXXXXXX', '...X...', '...X...', '...X...'],
  trash: ['...XXX...', 'XXXXXXXXX', '.XXXXXXX.', '.X.X.X.X.', '.X.X.X.X.', '.X.X.X.X.', '.X.X.X.X.', '.XXXXXXX.'],
  copy: ['XXXXXX...', 'X....X...', 'X....X...', 'X..XXXXXX', 'X..X....X', 'XXXX....X', '...X....X', '...X....X', '...XXXXXX'],
  clock: ['..XXXXX..', '.X.....X.', 'X...X...X', 'X...X...X', 'X...XXX.X', 'X.......X', '.X.....X.', '..XXXXX..'],
  lock: ['..XXXX..', '.X....X.', '.X....X.', 'XXXXXXXX', 'X......X', 'X..XX..X', 'X..XX..X', 'X......X', 'XXXXXXXX'],
  close: ['XX.....XX', '.XX...XX.', '..XX.XX..', '...XXX...', '....X....', '...XXX...', '..XX.XX..', '.XX...XX.', 'XX.....XX'],
} as const;

/** Une petite icône (voir TINY), à 2 px la case */
export const tiny = (name: keyof typeof TINY) => pixels(TINY[name], 2);

/** Le livre du guide (12 × 12, 2 px la case) */
const BOOK = ['.XXXXXXXXXX.', 'XX........XX', 'X.XXXXXXXX.X', 'X..........X', 'X.XXXXXXX..X', 'X..........X', 'X.XXXXXXXX.X', 'X..........X', 'X.XXXXX....X', 'X..........X', 'XXXXXXXXXXXX', '.XXXXXXXXXX.'];
