// La boutique : ce qu'on offre à Gilbert avec ses glands. Peu de choses, mais soignées.
// - Les pelages changent les quatre teintes de sa fourrure (le masque, le ventre et les yeux restent) :
//   toutes les animations suivent, sans rien redessiner.
// - Les accessoires sont posés sur chaque frame de la planche, calés sur ses yeux (de face, de profil,
//   penché quand on le tient par la queue). La couronne ne se pose que si le haut de sa tête est libre.
// La planche « habillée » remplace l'originale : tout le reste du code la dessine sans s'en soucier.

import type { Lang } from './types';

export interface Skin {
  fur: string;
  /** '' : aucun */
  accessory: string;
}

export const DEFAULT_SKIN: Skin = { fur: 'gray', accessory: '' };

export interface Item {
  id: string;
  kind: 'fur' | 'accessory';
  name: Record<Lang, string>;
  /** Le prix en glands, ou en glands dorés (les plus rares) */
  price: { acorns: number; golden: number };
}

/** Les teintes de la fourrure d'origine : ombres profondes, ombres, pelage, reflets */
const FUR_SOURCE = ['#2a3137', '#3c4248', '#646a6e', '#919498'];

const FURS: (Item & { colors: string[] | null })[] = [
  { id: 'gray', kind: 'fur', name: { fr: 'Gris d’origine', en: 'Original grey', vi: 'Xám nguyên bản' }, price: { acorns: 0, golden: 0 }, colors: null },
  { id: 'fox', kind: 'fur', name: { fr: 'Renard roux', en: 'Red fox', vi: 'Cáo đỏ' }, price: { acorns: 300, golden: 0 }, colors: ['#4a2412', '#7a3a18', '#b4592a', '#df8a4e'] },
  { id: 'snow', kind: 'fur', name: { fr: 'Neige', en: 'Snow', vi: 'Tuyết' }, price: { acorns: 300, golden: 0 }, colors: ['#6b7380', '#9aa1ab', '#c8ccd2', '#eceef1'] },
  { id: 'night', kind: 'fur', name: { fr: 'Minuit', en: 'Midnight', vi: 'Nửa đêm' }, price: { acorns: 450, golden: 0 }, colors: ['#151b2e', '#222c4a', '#34446e', '#5b6fa3'] },
  { id: 'gold', kind: 'fur', name: { fr: 'Or massif', en: 'Solid gold', vi: 'Vàng ròng' }, price: { acorns: 0, golden: 3 }, colors: ['#5a4210', '#8a6618', '#c39a2c', '#ecc95a'] },
];

const ACCESSORIES: Item[] = [
  { id: 'glasses', kind: 'accessory', name: { fr: 'Lunettes rondes', en: 'Round glasses', vi: 'Kính tròn' }, price: { acorns: 150, golden: 0 } },
  { id: 'shades', kind: 'accessory', name: { fr: 'Lunettes de soleil', en: 'Sunglasses', vi: 'Kính râm' }, price: { acorns: 250, golden: 0 } },
  { id: 'crown', kind: 'accessory', name: { fr: 'Couronne', en: 'Crown', vi: 'Vương miện' }, price: { acorns: 0, golden: 2 } },
];

export const SHOP = { furs: FURS as Item[], accessories: ACCESSORIES };
export const itemById = (id: string) => [...FURS, ...ACCESSORIES].find((i) => i.id === id) ?? null;

// ---------- les yeux, frame par frame ----------

const EYE = [0xf8, 0xf8, 0xf6];
/** Colonne du milieu des yeux dans toutes les frames de face (voir tools/gen-sprites.mjs) */
const AX = 22;

type Eyes = { kind: 'front'; l: [number, number]; r: [number, number] } | { kind: 'side'; e: [number, number] };

interface Atlas { size: number; cols: number; frames: Record<string, number> }

function eyesOf(data: ImageData, atlas: Atlas, index: number): Eyes | null {
  const S = atlas.size, fx = (index % atlas.cols) * S, fy = Math.floor(index / atlas.cols) * S;
  const whites: [number, number][] = [];
  for (let y = 0; y < S; y++) for (let x = AX - 5; x <= AX + 5; x++) {
    const o = ((fy + y) * data.width + fx + x) * 4;
    if (data.data[o + 3] && data.data[o] === EYE[0] && data.data[o + 1] === EYE[1] && data.data[o + 2] === EYE[2]) whites.push([x, y]);
  }
  // de face : deux yeux à 4 ou 5 colonnes l'un de l'autre, presque à la même hauteur, autour du milieu
  let best: Eyes | null = null, score = Infinity;
  for (const a of whites) for (const b of whites) {
    const dx = b[0] - a[0], dy = Math.abs(b[1] - a[1]);
    if (dx < 4 || dx > 6 || dy > 2) continue;
    const s = Math.abs((a[0] + b[0]) / 2 - AX) + dy;
    if (s < score) { score = s; best = { kind: 'front', l: a, r: b }; }
  }
  if (best) return best;
  // de profil (regarde à gauche) : un seul œil, trois colonnes avant le milieu de la tête
  const side = whites.find(([x]) => x === AX - 3);
  return side ? { kind: 'side', e: side } : null;
}

/** Les yeux de chaque frame ; une frame sans yeux visibles (clignement, rire) reprend ceux de sa voisine */
function allEyes(data: ImageData, atlas: Atlas) {
  const out: Record<string, Eyes | null> = {};
  for (const [name, i] of Object.entries(atlas.frames)) out[name] = eyesOf(data, atlas, i);
  // les yeux fermés de face : même tête que la pose assise
  for (const name of ['blink', 'happy']) out[name] ??= out.idle0;
  // le rire (yeux plissés) : la tête de la pose assise, décalée comme le haut de sa tête
  const top = (i: number) => {
    const S = atlas.size, fx = (i % atlas.cols) * S, fy = Math.floor(i / atlas.cols) * S;
    for (let y = 0; y < S; y++) for (let x = AX - 6; x <= AX + 6; x++) if (data.data[((fy + y) * data.width + fx + x) * 4 + 3]) return y;
    return 0;
  };
  const idle = out.idle0;
  if (idle?.kind === 'front') {
    for (const [name, i] of Object.entries(atlas.frames)) {
      if (out[name] || !name.startsWith('bounce')) continue;
      const dy = top(i) - top(atlas.frames.idle0);
      out[name] = { kind: 'front', l: [idle.l[0], idle.l[1] + dy], r: [idle.r[0], idle.r[1] + dy] };
    }
  }
  // dans une séquence (pendu…), la frame voisine la plus proche
  for (const name of Object.keys(out)) {
    if (out[name]) continue;
    const m = name.match(/^([a-z]+)(\d+)$/);
    if (!m || ['hang', 'gtail', 'pulled'].includes(m[1])) continue;
    const n = Number(m[2]);
    for (let d = 1; d < 12 && !out[name]; d++) out[name] = out[`${m[1]}${n - d}`] ?? out[`${m[1]}${n + d}`] ?? null;
  }
  return out;
}

// ---------- les dessins des accessoires ----------

type Paint = (x: number, y: number, color: string) => void;

const GOLD = '#e2b84a', GOLD_DARK = '#a07a22', GOLD_LIGHT = '#f6e29a';

/** Une monture ronde autour d'un œil : les bords dorés, les coins plus sombres (l'œil reste visible) */
function lens(paint: Paint, [x, y]: [number, number]) {
  for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) paint(x + dx, y + dy, dy === 1 ? GOLD_DARK : GOLD);
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) paint(x + dx, y + dy, GOLD_DARK);
}

/** Un verre fumé plein (il cache l'œil), avec son reflet */
function shade(paint: Paint, [x, y]: [number, number]) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) paint(x + dx, y + dy, dy === 1 ? '#1d2a5c' : '#2b3f86');
  paint(x - 1, y - 1, '#9cc0ff');
  paint(x, y - 1, '#5f7fd0');
}

/** Une ligne de pixels entre deux points (pont des lunettes, branches) */
function line(paint: Paint, [x0, y0]: [number, number], [x1, y1]: [number, number], color: string) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) paint(Math.round(x0 + ((x1 - x0) * i) / (n || 1)), Math.round(y0 + ((y1 - y0) * i) / (n || 1)), color);
}

const CROWN = [
  'Y...Y...Y',
  'YY.YLY.YY',
  'YYYYYYYYY',
  'YRYDBDYRY',
  'DDDDDDDDD',
];

function paintAccessory(id: string, paint: Paint, eyes: Eyes, opaque: (x: number, y: number) => boolean) {
  if (id === 'glasses' || id === 'shades') {
    const glass = id === 'glasses' ? lens : shade;
    const rim = id === 'glasses' ? GOLD : '#c2463c';
    if (eyes.kind === 'front') {
      const { l, r } = eyes;
      // le pont entre les deux verres, puis les branches vers les oreilles
      line(paint, [l[0] + 2, l[1] - 1], [r[0] - 2, r[1] - 1], rim);
      line(paint, [l[0] - 2, l[1] - 1], [l[0] - 3, l[1] - 1], rim);
      line(paint, [r[0] + 2, r[1] - 1], [r[0] + 3, r[1] - 1], rim);
      glass(paint, l);
      glass(paint, r);
    } else {
      // de profil : un verre, le pont vers le museau, la branche vers l'oreille
      const e = eyes.e;
      paint(e[0] - 2, e[1] - 1, rim);
      line(paint, [e[0] + 2, e[1] - 1], [e[0] + 5, e[1] - 1], rim);
      glass(paint, e);
    }
    return;
  }
  if (id === 'crown') {
    const [cx, ey] = eyes.kind === 'front' ? [Math.round((eyes.l[0] + eyes.r[0]) / 2), Math.min(eyes.l[1], eyes.r[1])] : [eyes.e[0] + 2, eyes.e[1]];
    // la tête doit être droite et dégagée au-dessus (pas quand il pend, tête en bas sous le corps)
    if (eyes.kind === 'front' && Math.abs(eyes.l[1] - eyes.r[1]) > 0) return;
    if (opaque(cx, ey - 9) || !opaque(cx, ey - 5)) return;
    const colors: Record<string, string> = { Y: GOLD, L: GOLD_LIGHT, D: GOLD_DARK, R: '#c2463c', B: '#4a78b8' };
    CROWN.forEach((row, j) => [...row].forEach((c, i) => { if (colors[c]) paint(cx - 4 + i, ey - 9 + j, colors[c]); }));
  }
}

// ---------- la planche habillée ----------

const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Une copie de la planche avec ce pelage et cet accessoire */
export function paintSkin(src: ImageData, atlas: Atlas, skin: Skin) {
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const d = out.data;
  const fur = FURS.find((f) => f.id === skin.fur)?.colors;
  if (fur) {
    const from = FUR_SOURCE.map(hexRgb), to = fur.map(hexRgb);
    for (let o = 0; o < d.length; o += 4) {
      if (!d[o + 3]) continue;
      const k = from.findIndex(([r, g, b]) => d[o] === r && d[o + 1] === g && d[o + 2] === b);
      if (k >= 0) [d[o], d[o + 1], d[o + 2]] = to[k];
    }
  }
  if (skin.accessory) {
    const eyes = allEyes(src, atlas);
    const S = atlas.size;
    for (const [name, i] of Object.entries(atlas.frames)) {
      const e = eyes[name];
      if (!e) continue;
      const fx = (i % atlas.cols) * S, fy = Math.floor(i / atlas.cols) * S;
      const at = (x: number, y: number) => ((fy + y) * out.width + fx + x) * 4;
      const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S;
      const opaque = (x: number, y: number) => inside(x, y) && src.data[at(x, y) + 3] > 0;
      const paint: Paint = (x, y, color) => {
        if (!inside(x, y)) return;
        const [r, g, b] = hexRgb(color);
        const o = at(x, y);
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      };
      paintAccessory(skin.accessory, paint, e, opaque);
    }
  }
  return out;
}
