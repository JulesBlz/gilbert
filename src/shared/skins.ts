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
  /** Le prix en glands */
  price: { acorns: number };
}

/** Les teintes de la fourrure d'origine : ombres profondes, ombres, pelage, reflets */
const FUR_SOURCE = ['#2a3137', '#3c4248', '#646a6e', '#919498'];

const FURS: (Item & { colors: string[] | null })[] = [
  { id: 'gray', kind: 'fur', name: { fr: 'Gris d’origine', en: 'Original grey', vi: 'Xám nguyên bản' }, price: { acorns: 0 }, colors: null },
  { id: 'fox', kind: 'fur', name: { fr: 'Renard roux', en: 'Red fox', vi: 'Cáo đỏ' }, price: { acorns: 300 }, colors: ['#4a2412', '#7a3a18', '#b4592a', '#df8a4e'] },
  { id: 'snow', kind: 'fur', name: { fr: 'Neige', en: 'Snow', vi: 'Tuyết' }, price: { acorns: 300 }, colors: ['#6b7380', '#9aa1ab', '#c8ccd2', '#eceef1'] },
  { id: 'night', kind: 'fur', name: { fr: 'Minuit', en: 'Midnight', vi: 'Nửa đêm' }, price: { acorns: 450 }, colors: ['#151b2e', '#222c4a', '#34446e', '#5b6fa3'] },
  { id: 'choco', kind: 'fur', name: { fr: 'Chocolat', en: 'Chocolate', vi: 'Sô-cô-la' }, price: { acorns: 300 }, colors: ['#2b1a12', '#4a2e1e', '#6e4630', '#9a6b4c'] },
  { id: 'sand', kind: 'fur', name: { fr: 'Caramel', en: 'Caramel', vi: 'Caramen' }, price: { acorns: 300 }, colors: ['#5a3f22', '#8c6a3c', '#c29a64', '#e8cd9c'] },
  { id: 'mint', kind: 'fur', name: { fr: 'Menthe', en: 'Mint', vi: 'Bạc hà' }, price: { acorns: 400 }, colors: ['#1f4a43', '#2f7a6c', '#55ad98', '#93dbc4'] },
  { id: 'ocean', kind: 'fur', name: { fr: 'Océan', en: 'Ocean', vi: 'Đại dương' }, price: { acorns: 450 }, colors: ['#0f3b55', '#1b6382', '#3792b5', '#7ac6df'] },
  { id: 'lavender', kind: 'fur', name: { fr: 'Lavande', en: 'Lavender', vi: 'Oải hương' }, price: { acorns: 450 }, colors: ['#3d2f66', '#61509c', '#8c7bc9', '#bcb0ee'] },
  { id: 'candy', kind: 'fur', name: { fr: 'Bonbon', en: 'Candy', vi: 'Kẹo ngọt' }, price: { acorns: 500 }, colors: ['#6e2f4c', '#a24e75', '#d57ba3', '#f2b0cc'] },
  { id: 'coal', kind: 'fur', name: { fr: 'Charbon', en: 'Charcoal', vi: 'Than đen' }, price: { acorns: 600 }, colors: ['#0d0d10', '#1c1c22', '#33333c', '#5a5a66'] },
  { id: 'gold', kind: 'fur', name: { fr: 'Or massif', en: 'Solid gold', vi: 'Vàng ròng' }, price: { acorns: 900 }, colors: ['#5a4210', '#8a6618', '#c39a2c', '#ecc95a'] },
];

const ACCESSORIES: Item[] = [
  { id: 'flower', kind: 'accessory', name: { fr: 'Fleur', en: 'Flower', vi: 'Bông hoa' }, price: { acorns: 100 } },
  { id: 'party', kind: 'accessory', name: { fr: 'Chapeau de fête', en: 'Party hat', vi: 'Mũ tiệc' }, price: { acorns: 150 } },
  { id: 'bowtie', kind: 'accessory', name: { fr: 'Nœud papillon', en: 'Bow tie', vi: 'Nơ cổ' }, price: { acorns: 150 } },
  { id: 'scarf', kind: 'accessory', name: { fr: 'Écharpe', en: 'Scarf', vi: 'Khăn quàng' }, price: { acorns: 250 } },
  { id: 'phones', kind: 'accessory', name: { fr: 'Casque audio', en: 'Headphones', vi: 'Tai nghe' }, price: { acorns: 350 } },
  { id: 'tophat', kind: 'accessory', name: { fr: 'Haut-de-forme', en: 'Top hat', vi: 'Mũ chóp cao' }, price: { acorns: 500 } },
  { id: 'wizard', kind: 'accessory', name: { fr: 'Chapeau de sorcier', en: 'Wizard hat', vi: 'Mũ phù thủy' }, price: { acorns: 550 } },
  { id: 'halo', kind: 'accessory', name: { fr: 'Auréole', en: 'Halo', vi: 'Vầng hào quang' }, price: { acorns: 800 } },
];

/** Les objets retirés de la boutique (leur prix est rendu en glands) */
export const RETIRED: Record<string, number> = { glasses: 150, shades: 250, crown: 700, lime: 500, beanie: 200 };

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
// Chaque dessin est une grille de lettres (une lettre = un pixel de la planche), centrée sur la tête.
// Les chapeaux posent leur dernière ligne sur le front ; le reste se cale sur les yeux.

type Paint = (x: number, y: number, color: string) => void;

interface Drawing {
  rows: string[];
  /** les '#' prennent ces couleurs, en rayures obliques de deux pixels */
  stripes?: string[];
  /** la version de profil (pour les accessoires du cou) : où la poser par rapport à l'œil, et son dessin */
  side?: { rows: string[]; dx: number; dy: number };
  pal: Record<string, string>;
  /** 'hat' : la dernière ligne repose sur le front ; 'float' : flotte au-dessus ; 'neck' : sous le menton */
  at: 'hat' | 'float' | 'neck' | 'eyes';
  /** décalage vertical (en pixels) par rapport à l'ancrage, vers le bas */
  dy?: number;
}

const RED = { R: '#c2463c', r: '#8e2f2a', P: '#e8705f' };
const CREAM = { C: '#efe6cf', c: '#c9bea3' };

const DRAWINGS: Record<string, Drawing> = {
  tophat: {
    at: 'hat',
    pal: { O: '#16161d', K: '#2b2b36', k: '#4d4d62', B: '#b3353d', b: '#7c2228', G: '#e8c24e' },
    rows: [
      '..OOOOOOOOOOO..',
      '..OkkKKKKKKKO..',
      '..OkkKKKKKKKO..',
      '..OkkKKKKKKKO..',
      '..OkkKKKKKKKO..',
      '..OkKKKKKKKKO..',
      '..OBBBBBBBBBO..',
      '..ObbbbbbbbbO..',
      '..OkKKKKKKKKO..',
      '.OkkKKKKKKKKKO.',
      'OOOOOOOOOOOOOOO',
    ],
  },
  party: {
    at: 'hat',
    stripes: ['A', 'B', 'D'],
    pal: { A: '#e8689a', B: '#f2cf4a', D: '#58c0d8', W: '#f7f2e4', w: '#d9d2bd' },
    rows: [
      '......WWW......',
      '......wWw......',
      '.......#.......',
      '.......#.......',
      '......###......',
      '......###......',
      '.....#####.....',
      '.....#####.....',
      '....#######....',
      '....#######....',
    ],
  },
  wizard: {
    at: 'hat',
    pal: { O: '#14163a', N: '#3a3d86', n: '#6468c4', D: '#262864', Y: '#f6d550', G: '#e8c24e', g: '#a07a22' },
    rows: [
      '.........OO....',
      '........OnDO...',
      '........OnDO...',
      '.......OYNDO...',
      '.......OnNNDO..',
      '......OnNNYDO..',
      '......OnNNNDO..',
      '.....OnNYNNDO..',
      '....OGGGGGGGO..',
      '....OgggggggO..',
      '.OnnNNNNNNNNNO.',
      'ODDDDDDDDDDDDDO',
    ],
  },
  phones: {
    at: 'eyes',
    dy: 0,
    side: { dx: -3, dy: -6, rows: ['.KKKKKKK..', 'K.......K.', 'K.......K.', '......KKKK', '......KPRK', '......KRRK', '......KRRK', '......KKKK'] },
    pal: { K: '#2e2e3a', k: '#4a4a5a', R: '#d8584a', P: '#f0907f' },
    rows: [
      '.....KKKKKKKKKKK.....',
      '....K...........K....',
      '...K.............K...',
      '...K.............K...',
      '...K.............K...',
      '..KKKK.........KKKK..',
      '..KPRK.........KRPK..',
      '..KRRK.........KRRK..',
      '..KRRK.........KRRK..',
      '..KRRK.........KRRK..',
      '..KKKK.........KKKK..',
    ],
  },
  halo: {
    at: 'float',
    pal: { G: '#f2cf4a', g: '#a07a22', L: '#fbeaa8' },
    rows: [
      '...LLLLL...',
      '.GG.....GG.',
      '...ggggg...',
    ],
  },
  flower: {
    at: 'hat',
    dy: 2,
    pal: { P: '#f27ca6', p: '#c94f80', Y: '#f2cf4a', G: '#4a9a52' },
    rows: [
      '.............PPP.....',
      '............PPYPP....',
      '............PYYYP....',
      '............pPYPp....',
      '.............pPp.....',
      '..............G......',
    ],
  },
  bowtie: {
    at: 'neck',
    pal: { R: '#c2463c', r: '#8e2f2a', d: '#6a2220' },
    side: { dx: 2, dy: 2, rows: ['RR.RR', 'RRdRR', 'RR.RR'] },
    rows: [
      'RRr...rRR',
      'RRRrdrRRR',
      'RRr...rRR',
    ],
  },
  scarf: {
    at: 'neck',
    pal: { R: '#c2463c', r: '#8e2f2a', C: '#efe6cf', c: '#c9bea3' },
    side: { dx: 2, dy: 2, rows: ['RCRC', 'rcrc', 'RCRC', 'rcrc'] },
    rows: [
      'RRCRRCRRCRR',
      'rrcrrcrrcrr',
      '........RR.',
      '........CC.',
      '........RR.',
      '........rr.',
    ],
  },
};

function paintAccessory(id: string, paint: Paint, eyes: Eyes, opaque: (x: number, y: number) => boolean) {
  const d = DRAWINGS[id];
  if (!d) return;
  const side = eyes.kind === 'side';
  // l'axe de la tête et la hauteur des yeux
  const cx = side ? eyes.e[0] + 1 : Math.round((eyes.l[0] + eyes.r[0]) / 2);
  const ey = side ? eyes.e[1] : Math.min(eyes.l[1], eyes.r[1]);
  // pendu, tête en bas, ou penché : on ne pose rien
  if (!side && eyes.l[1] !== eyes.r[1]) return;
  // le haut de la tête : la première ligne pleine au-dessus des yeux, près de l'axe
  let top = -1;
  for (let y = ey - 9; y <= ey - 3 && top < 0; y++) for (let x = cx - 2; x <= cx + 2; x++) if (opaque(x, y)) { top = y; break; }
  if (top < 0 || top > ey - 5) return;
  // quelque chose au-dessus de la tête (la queue, un bond) : on ne pose pas de chapeau
  if (d.at !== 'neck') for (let y = top - 14; y < top - 2; y++) for (let x = cx - 7; x <= cx + 7; x++) if (opaque(x, y)) return;
  const w = d.rows[0].length;
  const x0 = cx - (w >> 1);
  const y0 = d.at === 'eyes' ? ey + 2 + (d.dy ?? 0) - d.rows.length + 1 : d.at === 'neck' ? ey + 4 + (d.dy ?? 0) : (d.at === 'float' ? top - 4 : top + 1 + (d.dy ?? 0)) - d.rows.length + 1;
  if (side && (d.at === 'neck' || d.side)) {
    if (!d.side) return;
    d.side.rows.forEach((row, j) => [...row].forEach((c, i) => { if (d.pal[c]) paint(eyes.e[0] + d.side!.dx + i, eyes.e[1] + d.side!.dy + j, d.pal[c]); }));
    return;
  }
  d.rows.forEach((row, j) => [...row].forEach((c, i) => {
    const k = c === '#' && d.stripes ? d.stripes[((i + j) >> 1) % d.stripes.length] : c;
    if (d.pal[k]) paint(x0 + i, y0 + j, d.pal[k]);
  }));
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
      // pendu par la queue ou se débattant : tête en bas, rien ne tient
      if (!e || /^(hang|gtail|gbody|pulled|fall)/.test(name)) continue;
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
