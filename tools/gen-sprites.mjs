// Assemble la planche de sprites de Gilbert.
//
// - La pose assise et ses expressions (cligner, parler, réfléchir, joie, alerte, queue qui remue)
//   viennent de la référence, relevée case par case : c'est le dessin le plus propre.
// - La queue qui pend du haut de l'écran est celle de la référence, retournée.
// - Les grands mouvements (marche, bonds, petits sauts, saut vers le haut, chute, pendu) viennent des
//   planches générées, nettoyées par tools/clean-sprites.mjs (art/clean/*.json), à la même échelle.
// - Toutes les frames sont calées sur les yeux : la tête ne saute pas d'une frame à l'autre.
//
//   node tools/gen-sprites.mjs [--preview <dossier>]
//
// Sorties : assets/gilbert.png, assets/gilbert.json, assets/tray.png, assets/tray@2x.png, assets/head.png,
// assets/icon.png et installer.icns/.ico (l'appli et l'installeur : sa tête), assets/bin.png/.ico (sa
// poubelle, l'icône de son raccourci sur le bureau)

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const N = 44;       // taille d'une frame (la chute tête en bas est la plus haute)
const AX = 22;      // colonne où tombe le milieu des yeux, dans toutes les frames

const COLORS = {
  K: '#14191f', // contour, masque
  D: '#2a3137', // ombres profondes
  E: '#3c4248', // ombres
  B: '#646a6e', // pelage
  L: '#919498', // reflets
  W: '#e4dcd4', // sourcils, museau, ventre
  O: '#f8f8f6', // yeux
  M: '#5a2228', // bouche
  P: '#e58aa0', // langue
  S: '#b8bcc0',
  H: '#909eab', J: '#acb8c6', V: '#63788d', Q: '#7e8fa0', // métal bleuté de la poubelle
};

// ---------- la référence, case par case ----------

const BASE = [
  '..KK........KK.........',
  '..KBK......KBK.........',
  '..KDBKKKKKKBDK.........',
  '..KDBBBBBBBBDK.........',
  '..KBBBBBBBBBBK.........',
  '.KBBWWLBLWWLBBK........',
  '.KBWKKKEKKKWBBK.....KK.',
  'KEEKKOKEKOKKLLK....KKKK',
  'KEKKKKBBBKKKKLK....KEEK',
  '.KKKKWKKWEKKKK....KBBBK',
  '...KBWWWWLBKBBK...KKKBK',
  '....KDDDDDBBBBBK..KKKKK',
  '....KBBBBBBBBBBBK.KBBKK',
  '....KBBBBBBBBEBBK.KKBEK',
  '....KBEBBBBBEBBBEKBKKK.',
  '....KBEKBBKBEBBBEKEEK..',
  '....KEKKBBKEEBBBEKEK...',
  '....KEK.KEKKKKEEEKK....',
  '...KKKKKKK.KKKKKK......',
];
const EYES = [[5, 7], [9, 7]];
const TAIL_X = 17; // dans la référence, la queue occupe les colonnes ≥ 17

const copy = (rows) => rows.map((r) => [...r]);
const join_ = (g) => g.map((r) => r.join(''));
function set(g, pts, c) {
  for (const [x, y] of pts) if (g[y]?.[x] !== undefined) g[y][x] = c;
}

const eyes = {
  closed: (g) => set(g, EYES, 'K'),
  big: (g) => set(g, [...EYES, [5, 8], [9, 8]], 'O'),
  up: (g) => { set(g, EYES, 'K'); set(g, [[5, 6], [9, 6]], 'O'); },
};
// bouche sous la truffe : petite (2 pixels sombres) ou grande ouverte (avec la langue)
const mouth = {
  small: (g) => set(g, [[6, 10], [7, 10]], 'M'),
  open: (g) => { set(g, [[6, 10], [7, 10]], 'M'); set(g, [[6, 11], [7, 11]], 'P'); },
};

/** Balance le haut de la queue (lignes 6 à 10 de la référence) de `dx` colonnes */
function wag(g, dx) {
  const rows = [6, 7, 8, 9, 10];
  const saved = rows.map((y) => g[y].map((c, x) => (x >= TAIL_X ? c : '.')));
  for (const y of rows) for (let x = TAIL_X; x < g[y].length; x++) g[y][x] = '.';
  rows.forEach((y, i) => saved[i].forEach((c, x) => {
    if (c === '.') return;
    while (g[y].length <= x + dx) g[y].push('.');
    g[y][x + dx] = c;
  }));
  const w = Math.max(...g.map((r) => r.length));
  for (const r of g) while (r.length < w) r.push('.');
}

function ref(...edits) {
  const g = copy(BASE);
  for (const e of edits) e(g);
  return join_(g);
}

// la queue de la référence, retournée pour pendre du haut de l'écran
const TAIL = BASE.slice(6, 18).map((r) => r.slice(TAIL_X).padEnd(6, '.'));
const HANG = [...TAIL].reverse();

function hang(sway, pull = 0) {
  let t = HANG.map((r) => [...r]);
  if (pull) t = t.flatMap((r, i) => (i > 0 && i % 2 === 0 && i <= pull * 2 ? [r, [...r]] : [r]));
  if (sway) t = t.map((r, i) => (i >= 6 ? (sway > 0 ? ['.', ...r] : [...r.slice(1), '.']) : r));
  return join_(t);
}

// ---------- les mouvements nettoyés ----------

const sheet = (n) => JSON.parse(readFileSync(join(ROOT, 'art', 'clean', `sheet${n}.json`), 'utf8')).frames;
const flipX = (rows) => rows.map((r) => [...r].reverse().join(''));
const S = {
  fall: sheet(1),          // chute tête en bas, puis réception
  // marche de profil (regarde à gauche). Les frames 5 et 7 répètent la pose « pattes jointes »
  // de la 0 : on les retire pour un pas régulier, sur 6 temps.
  // Le corps perd aussi deux lignes de pixels (sous la tête) : il paraissait gras en marchant.
  // De profil, un seul œil : celui du côté du museau est caché.
  walk: slimmer(slimmer(sameHead([0, 1, 2, 3, 4, 6].map((i) => sheet(2)[i]), 1, { left: -7, right: 7, top: -9, bottom: 4 }, { farEye: false }), 6), 6),
  bounce: sheet(3),        // petits sauts sur place
  leap: sheet(5),          // appel puis saut vers le haut, bras levés
  grab: sheet(6),          // pendu par la queue, se débat
  // bonds de profil, retournés pour regarder à gauche comme le reste
  hop: sameHead(sheet(7).map(flipX), 4, { left: -6, right: 5, top: -9, bottom: 3 }, { farEye: false }),
};

// ---------- tête unique pour la marche et les bonds ----------
// Les planches générées redessinent la tête à chaque frame : masque, yeux et taille changent un
// peu, ce qui fait « trembler » la tête. On garde le corps et les pattes de chaque frame, et on y
// pose toujours la même tête (celle d'une frame propre), calée sur l'œil de la frame d'origine.

/** L'œil côté nuque (le plus à droite des deux, de profil vers la gauche) dans le haut de la frame */
function rightEye(rows) {
  const eyes = [];
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'O' && x < 10 && y >= 5 && y <= 13) eyes.push([x, y]); }));
  return eyes.sort((a, b) => b[0] - a[0] || a[1] - b[1])[0] ?? null;
}

/**
 * Pose la tête de `rows[from]` sur chaque frame. `box` : la zone de la tête autour de l'œil
 * (colonnes et lignes, relatives à l'œil). Ailleurs, le blanc pur qui traîne (reflets parasites sur
 * le ventre ou la queue) redevient la couleur voisine.
 */
function sameHead(frames, from, box, { farEye = true } = {}) {
  const grid = (rows) => rows.map((r) => [...r]);
  const src = grid(frames[from]);
  const [sx, sy] = rightEye(frames[from]);
  // de profil, l'œil du côté du museau est caché derrière la tête : on le peint en masque noir
  if (!farEye) src.forEach((r) => r.forEach((c, x) => { if (c === 'O' && x < sx - 1) r[x] = 'K'; }));
  return frames.map((rows) => {
    const g = grid(rows);
    const eye = rightEye(rows);
    if (eye) {
      const [fx, fy] = eye;
      for (let dy = box.top; dy <= box.bottom; dy++) {
        for (let dx = box.left; dx <= box.right; dx++) {
          const x = fx + dx, y = fy + dy;
          if (y < 0 || y >= g.length || x < 0 || x >= g[0].length) continue;
          g[y][x] = src[sy + dy]?.[sx + dx] ?? '.';
        }
      }
    }
    // reflets isolés hors de la tête
    const inHead = (x, y) => eye && x - eye[0] >= box.left && x - eye[0] <= box.right && y - eye[1] >= box.top && y - eye[1] <= box.bottom;
    g.forEach((r, y) => r.forEach((c, x) => {
      if (c !== 'O' || inHead(x, y)) return;
      const around = [g[y - 1]?.[x], g[y + 1]?.[x], r[x - 1], r[x + 1]].filter((v) => v && v !== '.' && v !== 'O');
      const count = {};
      for (const v of around) count[v] = (count[v] ?? 0) + 1;
      r[x] = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'B';
    }));
    return g.map((r) => r.join(''));
  });
}

/** Retire la ligne `below` lignes sous l'œil de chaque frame (un pixel de corps en moins) */
function slimmer(frames, below) {
  return frames.map((rows) => {
    const eye = rightEye(rows);
    return eye ? rows.filter((_, y) => y !== eye[1] + below) : rows;
  });
}

// ---------- calage ----------

/** Colonnes des yeux (amas de blanc pur) : un point par œil */
function eyeColumns(rows) {
  const xs = [...new Set(rows.flatMap((r) => [...r].flatMap((c, x) => (c === 'O' ? [x] : []))))].sort((a, b) => a - b);
  if (!xs.length) return [];
  const groups = [[xs[0]]];
  for (const x of xs.slice(1)) {
    if (x - groups[groups.length - 1].at(-1) <= 1) groups[groups.length - 1].push(x);
    else groups.push([x]);
  }
  return groups.map((g) => (g[0] + g[g.length - 1]) / 2);
}

/** Point de calage horizontal d'un dessin : milieu des yeux de face, ou l'œil (+ décalage) de profil */
function anchorOf(rows, view) {
  const eyesX = eyeColumns(rows);
  if (view === 'front' && eyesX.length >= 2) return (eyesX[0] + eyesX[eyesX.length - 1]) / 2;
  // de profil (regarde à gauche) : le milieu de la tête est un peu en arrière de l'œil
  if (view === 'side' && eyesX.length >= 1) return eyesX[0] + 3;
  return null;
}

const blank = () => Array.from({ length: N }, () => Array(N).fill(0));

/** Pose un dessin dans une frame N×N, le point de calage sur la colonne AX, en bas ou en haut */
function place(rows, anchorX, align = 'bottom') {
  const g = blank();
  const h = rows.length;
  const x0 = Math.round(AX - anchorX), y0 = align === 'bottom' ? N - h : 0;
  rows.forEach((r, j) => [...r].forEach((c, i) => {
    const x = x0 + i, y = y0 + j;
    if (c !== '.' && COLORS[c] && x >= 0 && x < N && y >= 0 && y < N) g[y][x] = c;
  }));
  return g;
}

/**
 * Cale une séquence : chaque frame sur ses yeux ; une frame où ils ne se voient pas reprend
 * le décalage moyen de la séquence par rapport au centre de son dessin.
 */
function placeSequence(frames, view, align = 'bottom', anchor = anchorOf) {
  const centers = frames.map((f) => f[0].length / 2);
  const anchors = frames.map((f) => anchor(f, view));
  const offsets = anchors.map((a, i) => (a == null ? null : a - centers[i])).filter((v) => v != null).sort((a, b) => a - b);
  const median = offsets.length ? offsets[offsets.length >> 1] : 0;
  return frames.map((f, i) => place(f, anchors[i] ?? centers[i] + median, align));
}


// ---------- frames ----------

const frames = {};
const baseAnchor = (EYES[0][0] + EYES[1][0]) / 2;
const addRef = (name, rows, align = 'bottom') => { frames[name] = place(rows, baseAnchor, align); };
const addSeq = (prefix, list) => list.forEach((g, i) => { frames[`${prefix}${i}`] = g; });

addRef('idle0', ref());
addRef('idle1', ref((g) => wag(g, 1)));
addRef('idle2', ref((g) => wag(g, -1)));
addRef('blink', ref(eyes.closed));
addRef('talk0', ref(mouth.small));
addRef('talk1', ref(mouth.open));
addRef('think', ref(eyes.up));
addRef('happy', ref(eyes.closed, mouth.small));
addRef('alert0', ref(eyes.big, mouth.small));
addRef('alert1', ref(eyes.big, mouth.small, (g) => wag(g, 1)));

// au travail : assis derrière un petit ordinateur (on en voit le dos), les yeux sur l'écran,
// les pattes qui tapent à tour de rôle au-dessus du clavier
const LAPTOP = [
  '..KKKKKKKKKKKK..',
  '..KEEEEEEEEEEK..',
  '..KEEEEEEEEEEK..',
  '..KEEEEELLEEEK..',
  '..KEEEEELLEEEK..',
  '..KEEEEEEEEEEK..',
  'KKKKKKKKKKKKKKKK',
];
function laptop(paws) {
  return (g) => {
    LAPTOP.forEach((r, j) => [...r].forEach((c, i) => { if (c !== '.') set(g, [[i - 1, 12 + j]], c); }));
    // les pattes posées sur le bord de l'écran ; levée = un pixel plus haut
    for (const [x, up] of paws) set(g, [[x, up ? 11 : 12], [x + 1, up ? 11 : 12]], 'B');
  };
}
addRef('work0', ref(laptop([[3, false], [10, false]])));
addRef('work1', ref(laptop([[3, true], [10, false]])));
addRef('work2', ref(laptop([[3, false], [10, true]])));

addSeq('walk', placeSequence(S.walk, 'side'));
addSeq('hop', placeSequence(S.hop, 'side'));
addSeq('bounce', placeSequence(S.bounce, 'front'));
addSeq('leap', placeSequence(S.leap, 'front'));
addSeq('fall', placeSequence(S.fall, 'front'));
// pendu par la queue, en deux morceaux articulés : la queue (tenue par le curseur) et le corps
// (accroché au bout de la queue). Le code les fait pivoter chacun sur son articulation.
// la queue s'arrête là où elle s'attache : juste après la partie la plus fine (le « cou » de la queue)
const tailRows = (rows) => {
  const width = (r) => r.replace(/^\.+|\.+$/g, '').length;
  let end = 0;
  for (let y = 0; y < rows.length / 2; y++) if (width(rows[y]) <= 5) end = y + 1;
  return end;
};
const rowCenter = (r) => {
  const xs = [...r].flatMap((c, x) => (c !== '.' ? [x] : []));
  return (xs[0] + xs[xs.length - 1]) / 2;
};
const gTail = S.grab[0].slice(0, tailRows(S.grab[0]));
frames.gtail = place(gTail, rowCenter(gTail[0]), 'top');
const tailBaseDx = rowCenter(gTail[gTail.length - 1]) - rowCenter(gTail[0]);
const bodies = S.grab.map((f) => f.slice(tailRows(f)));
bodies.forEach((b, i) => { frames[`gbody${i}`] = place(b, rowCenter(b[0]), 'top'); });
const GRAB = {
  tailTip: [AX + 0.5, 0],
  tailBase: [AX + 0.5 + Math.round(tailBaseDx), gTail.length],
  bodyJoint: [AX + 0.5, 0],
  bodyHeight: Math.max(...bodies.map((b) => b.length)),
};

// queue qui pend : centrée sur la colonne de calage
const hangAnchor = 3;
frames.hang0 = place(hang(0), hangAnchor, 'top');
frames.hang1 = place(hang(1), hangAnchor, 'top');
frames.hang2 = place(hang(-1), hangAnchor, 'top');
frames.pulled = place(hang(0, 3), hangAnchor, 'top');


// ---------- PNG ----------

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

function sheetPng(grids, cols, scale = 1, bg = null, gap = 0) {
  const n = grids[0].length;
  const rows = Math.ceil(grids.length / cols);
  const cell = n * scale + gap;
  const w = cols * cell + gap, h = rows * cell + gap;
  const buf = Buffer.alloc(w * h * 4);
  if (bg) {
    const [r, g, b] = hex(bg);
    for (let i = 0; i < w * h; i++) { buf[i * 4] = r; buf[i * 4 + 1] = g; buf[i * 4 + 2] = b; buf[i * 4 + 3] = 255; }
  }
  grids.forEach((gr, i) => {
    const cx = (i % cols) * cell + gap, cy = Math.floor(i / cols) * cell + gap;
    for (let y = 0; y < n; y++) for (let x = 0; x < gr[y].length; x++) {
      const s = gr[y][x];
      if (!COLORS[s]) continue;
      const [r, g, b] = hex(COLORS[s]);
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
        const o = ((cy + y * scale + sy) * w + cx + x * scale + sx) * 4;
        buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = 255;
      }
    }
  });
  return png(w, h, buf);
}

// ---------- écriture ----------

const names = Object.keys(frames);
const grids = names.map((k) => frames[k]);
const COLS = 10;
const assets = join(ROOT, 'assets');
mkdirSync(assets, { recursive: true });

writeFileSync(join(assets, 'gilbert.png'), sheetPng(grids, COLS));
writeFileSync(join(assets, 'gilbert.json'), JSON.stringify({
  size: N,
  cols: COLS,
  // la pose assise dans la frame : colonne de gauche, largeur et hauteur (pour placer bulle et symboles)
  base: { x: Math.round(AX - baseAnchor), width: BASE[0].length, height: BASE.length },
  frames: Object.fromEntries(names.map((k, i) => [k, i])),
  // pendu articulé : bout et base de la queue, point d'accroche du corps (pixels de la frame)
  grab: GRAB,
  hangLength: HANG.length,
  counts: Object.fromEntries(Object.entries(S).map(([k, v]) => [k, v.length])),
}, null, 2) + '\n');

// le logo : sa tête seule (sans la queue ni l'épaule), menton refermé
const HEAD = BASE.slice(0, 11).map((r) => r.slice(0, 15));
HEAD[10] = '...KBWWWWLBK...';
HEAD.push('....KKKKKKK....');
/** La tête au centre d'un carré de `n` pixels */
const square = (n) => {
  const ox = Math.floor((n - HEAD[0].length) / 2), oy = Math.floor((n - HEAD.length) / 2);
  return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => HEAD[y - oy]?.[x - ox] ?? '.'));
};
// barre des menus (16 × 16), fenêtre de Gilbert, icône de l'appli (avec une marge, comme les icônes macOS)
writeFileSync(join(assets, 'tray.png'), sheetPng([square(16)], 1, 1));
writeFileSync(join(assets, 'tray@2x.png'), sheetPng([square(16)], 1, 2));
writeFileSync(join(assets, 'head.png'), sheetPng([square(16)], 1, 8));
// sa poubelle (assets/bin.png, bin.ico, dumpster.png) : tools/make-dumpster.py
/** Un .ico qui contient une seule image PNG */
const icoOf = (png) => {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  // largeur et hauteur de l'image (0 = 256 px), lues dans l'en-tête du PNG
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  head.writeUInt8(w >= 256 ? 0 : w, 6); head.writeUInt8(h >= 256 ? 0 : h, 7); head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
  head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png]);
};
// l'appli et son installeur : sa tête. En .icns pour le .dmg (Mac, chaque taille nette, sans lissage)
// et en .ico pour l'installeur Windows
writeFileSync(join(assets, 'icon.png'), sheetPng([square(22)], 1, 24));
const iconset = join(assets, 'installer.iconset');
mkdirSync(iconset, { recursive: true });
for (const n of [16, 32, 128, 256, 512]) {
  writeFileSync(join(iconset, `icon_${n}x${n}.png`), sheetPng([square(16)], 1, n / 16));
  writeFileSync(join(iconset, `icon_${n}x${n}@2x.png`), sheetPng([square(16)], 1, (n * 2) / 16));
}
if (process.platform === 'darwin') execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(assets, 'installer.icns')]);
rmSync(iconset, { recursive: true, force: true });
writeFileSync(join(assets, 'installer.ico'), icoOf(sheetPng([square(16)], 1, 16)));

const pi = process.argv.indexOf('--preview');
if (pi > 0) {
  const dir = process.argv[pi + 1];
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'preview.png'), sheetPng(grids, 10, 3, '#dfe5ec', 3));
  console.log('aperçu :', join(dir, 'preview.png'));
}
console.log(`${names.length} frames → assets/gilbert.png`);
