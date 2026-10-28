// Nettoie des planches de sprites « pixel art » générées par IA (floues, grille approximative) :
//   1. découpe chaque personnage (fond, traits de mouvement et ombres retirés) ;
//   2. retrouve la taille réelle d'un « pixel » de la planche ;
//   3. ramène chaque case à une couleur de la palette de Gilbert.
//
//   node tools/clean-sprites.mjs <planche.png> [--count <frames>] [--out <fichier.json>] [--preview <image.png>] [--cell <taille>]
//
// --count : nombre de frames attendu ; si des personnages se touchent, ils sont séparés
// en coupant dans les creux entre eux.
//
// La planche est lue via `sips` (macOS) convertie en BMP. Le résultat est une liste de frames
// en grilles de caractères (même alphabet que tools/gen-sprites.mjs).

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

// ---------- arguments ----------

const args = process.argv.slice(2);
const input = args[0];
const opt = (name) => { const i = args.indexOf(name); return i > 0 ? args[i + 1] : null; };
const forcedCell = opt('--cell') ? Number(opt('--cell')) : null;
const expected = opt('--count') ? Number(opt('--count')) : null;

// ---------- palette de Gilbert ----------

export const PALETTE = {
  K: [20, 25, 31],
  D: [42, 49, 55],
  E: [60, 66, 72],
  B: [100, 106, 110],
  L: [145, 148, 152],
  W: [228, 220, 212],
  O: [248, 248, 246],
  P: [229, 138, 160],
};

// ---------- lecture de l'image (BMP 24/32 bits produit par sips) ----------

function load(file) {
  const tmp = path.join(mkdtempSync(path.join(os.tmpdir(), 'gilbert-clean-')), 'sheet.bmp');
  execFileSync('sips', ['-s', 'format', 'bmp', file, '--out', tmp], { stdio: 'ignore' });
  const buf = readFileSync(tmp);
  const off = buf.readUInt32LE(10), w = buf.readInt32LE(18), h0 = buf.readInt32LE(22), bpp = buf.readUInt16LE(28);
  const h = Math.abs(h0), Bp = bpp / 8, stride = Math.ceil((w * Bp) / 4) * 4;
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const row = off + (h0 > 0 ? h - 1 - y : y) * stride;
    for (let x = 0; x < w; x++) {
      const o = row + x * Bp, d = (y * w + x) * 3;
      // planche à fond transparent (BMP 32 bits) : on pose l'image sur du blanc
      const alpha = Bp === 4 ? buf[o + 3] / 255 : 1;
      rgb[d] = Math.round(buf[o + 2] * alpha + 255 * (1 - alpha));
      rgb[d + 1] = Math.round(buf[o + 1] * alpha + 255 * (1 - alpha));
      rgb[d + 2] = Math.round(buf[o] * alpha + 255 * (1 - alpha));
    }
  }
  return { w, h, rgb };
}

const lum = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;

// ---------- 1. découpe des personnages ----------

function sprites(img, count) {
  const { w, h, rgb } = img;
  // « encre » : tout ce qui n'est pas le fond presque blanc
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) ink[i] = lum(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]) < 215 ? 1 : 0;

  // composantes connexes
  const label = new Int32Array(w * h).fill(-1);
  const comps = [];
  const stack = [];
  for (let start = 0; start < w * h; start++) {
    if (!ink[start] || label[start] >= 0) continue;
    const c = { x0: w, y0: h, x1: 0, y1: 0, area: 0, id: comps.length };
    label[start] = c.id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop();
      const x = p % w, y = (p / w) | 0;
      c.area++;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (ink[q] && label[q] < 0) { label[q] = c.id; stack.push(q); }
      }
    }
    comps.push(c);
  }

  // on garde les gros morceaux : traits de mouvement, ombres et poussières sont fins ou petits
  const big = comps.filter((c) => {
    const cw = c.x1 - c.x0 + 1, ch = c.y1 - c.y0 + 1;
    return c.area > 2500 && Math.min(cw, ch) > 40;
  });
  // fusion des morceaux d'un même personnage (patte détachée, etc.)
  const groups = big.map((c) => ({ ...c, ids: [c.id] }));
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < groups.length && !merged; i++) for (let j = i + 1; j < groups.length && !merged; j++) {
      const a = groups[i], b = groups[j], gap = 6;
      // seuls les petits morceaux rejoignent un gros : deux personnages voisins restent séparés
      const small = Math.min(a.area, b.area) < 0.25 * Math.max(a.area, b.area);
      if (small && a.x0 - gap <= b.x1 && b.x0 - gap <= a.x1 && a.y0 - gap <= b.y1 && b.y0 - gap <= a.y1) {
        Object.assign(a, { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), area: a.area + b.area });
        a.ids.push(...b.ids);
        groups.splice(j, 1);
        merged = true;
      }
    }
  }
  // personnages qui se chevauchent : on coupe le plus large dans les creux de la projection
  while (count && groups.length < count) {
    const g = groups.reduce((a, b) => (b.x1 - b.x0 > a.x1 - a.x0 ? b : a));
    const k = count - groups.length + 1;
    const W = g.x1 - g.x0 + 1;
    const col = new Float64Array(W);
    for (let y = g.y0; y <= g.y1; y++) for (let x = g.x0; x <= g.x1; x++) if (g.ids.includes(label[y * w + x])) col[x - g.x0]++;
    const cuts = [];
    for (let i = 1; i < k; i++) {
      const center = (i * W) / k, span = (W / k) * 0.35;
      let best = Math.round(center), bestV = Infinity;
      for (let x = Math.round(center - span); x <= center + span; x++) if (col[x] < bestV) { bestV = col[x]; best = x; }
      cuts.push(g.x0 + best);
    }
    const bounds = [g.x0, ...cuts, g.x1 + 1];
    groups.splice(groups.indexOf(g), 1, ...bounds.slice(0, -1).map((x0, i) => ({ ...g, x0, x1: bounds[i + 1] - 1, split: true })));
  }
  // ordre de lecture : par rangées, puis de gauche à droite
  groups.sort((a, b) => a.y0 - b.y0);
  const rows = [];
  for (const g of groups) {
    const row = rows.find((r) => g.y0 < r.y1 && g.y1 > r.y0 && Math.abs((g.y0 + g.y1) / 2 - (r.y0 + r.y1) / 2) < (r.y1 - r.y0));
    if (row) { row.items.push(g); row.y0 = Math.min(row.y0, g.y0); row.y1 = Math.max(row.y1, g.y1); }
    else rows.push({ y0: g.y0, y1: g.y1, items: [g] });
  }
  return { label, list: rows.flatMap((r) => r.items.sort((a, b) => a.x0 - b.x0)) };
}

// ---------- 2. couleurs ----------

// le blanc pur n'est pas proposé ici : il ne sert qu'aux yeux et au fond (voir 'white')
const KEYS = Object.keys(PALETTE).filter((k) => k !== 'O');
function nearest(r, g, b) {
  let best = '.', bd = Infinity;
  // blanc pur : le fond, ou les yeux s'il est enfermé dans le dessin ; le crème reste du crème
  if (lum(r, g, b) > 244 && Math.abs(r - b) < 10) return 'white';
  for (const k of KEYS) {
    const [pr, pg, pb] = PALETTE[k];
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

// ---------- 3. taille d'un pixel de la planche ----------

/**
 * Profil des contours le long d'un axe : pour chaque colonne (axis 'x') ou ligne ('y'),
 * la somme des écarts de luminosité avec la voisine. Les bords des cases y forment des pics réguliers.
 */
function profile(img, box, axis) {
  const { w, rgb } = img;
  const L = (x, y) => { const i = (y * w + x) * 3; return lum(rgb[i], rgb[i + 1], rgb[i + 2]); };
  const n = axis === 'x' ? box.x1 - box.x0 : box.y1 - box.y0;
  const g = new Float64Array(n);
  for (let a = 0; a < n; a++) {
    let sum = 0;
    if (axis === 'x') for (let y = box.y0; y <= box.y1; y++) sum += Math.abs(L(box.x0 + a + 1, y) - L(box.x0 + a, y));
    else for (let x = box.x0; x <= box.x1; x++) sum += Math.abs(L(x, box.y0 + a + 1) - L(x, box.y0 + a));
    g[a] = sum;
  }
  // on retire la tendance lente pour ne garder que les pics
  const mean = g.reduce((a, b) => a + b, 0) / n;
  return g.map((v) => v - mean);
}

/** Autocorrélation normalisée d'un profil, pour des décalages de 0 à maxLag */
function autocorr(p, maxLag) {
  const out = new Float64Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < p.length; i++) s += p[i] * p[i + lag];
    out[lag] = s / (p.length - lag);
  }
  return out.map((v) => v / out[0]);
}

/** Taille de case : premier pic net de l'autocorrélation (les multiples sont aussi des pics) */
function cellSize(img, boxes, sMin = 6, sMax = 40) {
  const sum = new Float64Array(sMax + 2);
  for (const box of boxes) for (const axis of ['x', 'y']) {
    const ac = autocorr(profile(img, box, axis), sMax + 1);
    for (let i = 0; i < ac.length; i++) sum[i] += ac[i];
  }
  const peaks = [];
  for (let l = sMin; l <= sMax; l++) if (sum[l] > sum[l - 1] && sum[l] >= sum[l + 1]) peaks.push(l);
  const best = Math.max(...peaks.map((l) => sum[l]));
  const l = peaks.find((p) => sum[p] >= best * 0.8);
  // affinage sous-pixel (parabole sur les trois points du pic)
  const [a, b, c] = [sum[l - 1], sum[l], sum[l + 1]];
  return l + (a - c) / (2 * (a - 2 * b + c) || 1);
}

/** Décalage de la grille dans une frame : celui qui aligne le plus de contours */
function offset(img, box, axis, s) {
  const p = profile(img, box, axis);
  let best = 0, bestScore = -Infinity;
  for (let o = 0; o < s; o += 0.25) {
    let score = 0;
    for (let k = o; k < p.length; k += s) score += p[Math.round(k)] ?? 0;
    if (score > bestScore) { bestScore = score; best = o; }
  }
  // les contours sont entre deux colonnes : la case commence juste après
  return best + 1;
}

// ---------- 4. échantillonnage d'une frame ----------

function sample(img, sp, s, ox, oy, label) {
  const { w, rgb } = img;
  const cols = Math.ceil((sp.x1 - sp.x0 + 1 - ox) / s) + 1;
  const rows = Math.ceil((sp.y1 - sp.y0 + 1 - oy) / s) + 1;
  const grid = [];
  for (let j = -1; j < rows; j++) {
    const row = [];
    for (let i = -1; i < cols; i++) {
      const cx0 = sp.x0 + ox + i * s, cy0 = sp.y0 + oy + j * s;
      const counts = {};
      let inside = 0, total = 0;
      // le centre de la case (60 %), pour éviter le flou des bords
      for (let y = Math.round(cy0 + s * 0.2); y < cy0 + s * 0.8; y++) for (let x = Math.round(cx0 + s * 0.2); x < cx0 + s * 0.8; x++) {
        if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
        total++;
        const p = y * w + x;
        // (pour une frame coupée, les pixels au-delà de la coupe appartiennent au voisin)
        if (label[p] >= 0 && sp.ids.includes(label[p]) && x >= sp.x0 && x <= sp.x1) inside++;
        const c = nearest(rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]);
        counts[c] = (counts[c] || 0) + 1;
      }
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'white';
      // une case qui n'appartient pas au personnage (trait de mouvement voisin…) devient du fond
      row.push(total && inside / total < 0.25 && top !== 'white' ? 'white' : top);
    }
    grid.push(row);
  }
  // le blanc relié au bord est le fond ; le blanc enfermé (les yeux) reste blanc
  const H = grid.length, W = grid[0].length;
  const seen = Array.from({ length: H }, () => Array(W).fill(false));
  const queue = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((y === 0 || x === 0 || y === H - 1 || x === W - 1) && grid[y][x] === 'white') queue.push([x, y]);
  while (queue.length) {
    const [x, y] = queue.pop();
    if (x < 0 || y < 0 || x >= W || y >= H || seen[y][x] || grid[y][x] !== 'white') continue;
    seen[y][x] = true;
    grid[y][x] = '.';
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  // blanc enfermé : un œil s'il est tout entouré du masque noir, sinon crème (sourcils, museau, ventre)
  whiteRegions(grid);
  // les yeux, repérés directement dans l'image : un éclat clair au milieu du noir
  for (const [ex, ey] of eyeGlints(img, sp, s)) {
    const i = Math.floor((ex - (sp.x0 + ox)) / s) + 1, j = Math.floor((ey - (sp.y0 + oy)) / s) + 1;
    if (grid[j]?.[i] !== undefined && grid[j][i] !== '.') grid[j][i] = 'O';
  }
  const cleaned = trim(largestBlob(despeckle(grid)).map((r) => r.join('')));
  return dropShadow(cleaned);
}

/**
 * Éclats des yeux dans la source : petites taches très claires, entourées de noir
 * (le masque). Ils sont souvent plus petits qu'une case, et l'échantillonnage les perdrait.
 */
function eyeGlints(img, sp, cell) {
  const { w, rgb } = img;
  const L = (x, y) => { const i = (y * w + x) * 3; return lum(rgb[i], rgb[i + 1], rgb[i + 2]); };
  const x0 = Math.max(0, sp.x0), x1 = Math.min(img.w - 1, sp.x1), y0 = Math.max(0, sp.y0), y1 = Math.min(img.h - 1, sp.y1);
  const seen = new Uint8Array((x1 - x0 + 1) * (y1 - y0 + 1));
  const idx = (x, y) => (y - y0) * (x1 - x0 + 1) + (x - x0);
  const out = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (seen[idx(x, y)] || L(x, y) < 215) continue;
    // tache claire d'un seul tenant
    const stack = [[x, y]];
    seen[idx(x, y)] = 1;
    let n = 0, sx = 0, sy = 0, bx0 = x, bx1 = x, by0 = y, by1 = y;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      n++; sx += cx; sy += cy;
      bx0 = Math.min(bx0, cx); bx1 = Math.max(bx1, cx); by0 = Math.min(by0, cy); by1 = Math.max(by1, cy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < x0 || ny < y0 || nx > x1 || ny > y1 || seen[idx(nx, ny)] || L(nx, ny) < 215) continue;
        seen[idx(nx, ny)] = 1;
        stack.push([nx, ny]);
      }
    }
    // taille d'un œil : entre un quart de case et deux cases environ
    if (n < cell * cell * 0.15 || n > cell * cell * 2.2 || bx1 - bx0 > cell * 2 || by1 - by0 > cell * 2) continue;
    // entourée de noir : sur un anneau autour de la tache, l'essentiel est très sombre
    const pad = Math.round(cell * 0.7);
    let ring = 0, dark = 0;
    for (let yy = by0 - pad; yy <= by1 + pad; yy++) for (let xx = bx0 - pad; xx <= bx1 + pad; xx++) {
      if (xx >= bx0 && xx <= bx1 && yy >= by0 && yy <= by1) continue;
      if (xx < 0 || yy < 0 || xx >= img.w || yy >= img.h) continue;
      ring++;
      if (L(xx, yy) < 70) dark++;
    }
    if (ring && dark / ring >= 0.5) out.push([sx / n, sy / n]);
  }
  return out;
}

function whiteRegions(g) {
  const H = g.length, W = g[0].length;
  const seen = g.map((r) => r.map(() => false));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x] !== 'white' || seen[y][x]) continue;
    const cells = [];
    const stack = [[x, y]];
    seen[y][x] = true;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      cells.push([cx, cy]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny][nx] || g[ny][nx] !== 'white') continue;
        seen[ny][nx] = true;
        stack.push([nx, ny]);
      }
    }
    const inRegion = new Set(cells.map(([cx, cy]) => cy * W + cx));
    let dark = true;
    for (const [cx, cy] of cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (inRegion.has(ny * W + nx)) continue;
      const v = g[ny]?.[nx];
      if (v !== 'K' && v !== 'D') dark = false;
    }
    const c = dark && cells.length <= 6 ? 'O' : 'W';
    for (const [cx, cy] of cells) g[cy][cx] = c;
  }
}

/** L'ombre portée au sol n'est pas Gilbert : rangées du bas sans aucun contour noir */
function dropShadow(rows) {
  const r = [...rows];
  while (r.length > 1 && !r[r.length - 1].includes('K')) r.pop();
  return trim(r);
}

/** Ne garde que le plus gros morceau d'un seul tenant (retire les bouts d'un voisin coupé) */
function largestBlob(g) {
  const H = g.length, W = g[0].length;
  const id = g.map((r) => r.map(() => -1));
  const sizes = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x] === '.' || id[y][x] >= 0) continue;
    const n = sizes.length;
    let size = 0;
    const stack = [[x, y]];
    id[y][x] = n;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      size++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || g[ny][nx] === '.' || id[ny][nx] >= 0) continue;
        id[ny][nx] = n;
        stack.push([nx, ny]);
      }
    }
    sizes.push(size);
  }
  const keep = sizes.indexOf(Math.max(...sizes));
  return g.map((r, y) => r.map((c, x) => (id[y][x] === keep ? c : '.')));
}

/**
 * Retire les pixels isolés (aucun voisin direct de la même couleur), dus au flou de la planche.
 * Les yeux (blanc pur) sont épargnés : ce sont justement des points isolés dans le masque.
 */
function despeckle(g) {
  const H = g.length, W = g[0].length;
  const out = g.map((r) => [...r]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = g[y][x];
    if (c === '.' || c === 'O') continue;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => g[y + dy]?.[x + dx] ?? '.');
    if (n.includes(c)) continue;
    const counts = {};
    for (const v of n) if (v !== '.') counts[v] = (counts[v] || 0) + 1;
    const top = Object.entries(counts).sort((p, q) => q[1] - p[1])[0];
    if (top) out[y][x] = top[0];
  }
  return out;
}

function trim(rows) {
  let top = 0, bottom = rows.length - 1;
  while (top < bottom && /^\.*$/.test(rows[top])) top++;
  while (bottom > top && /^\.*$/.test(rows[bottom])) bottom--;
  const r = rows.slice(top, bottom + 1);
  let left = 0, right = r[0].length - 1;
  while (left < right && r.every((x) => x[left] === '.')) left++;
  while (right > left && r.every((x) => x[right] === '.')) right--;
  return r.map((x) => x.slice(left, right + 1));
}

// ---------- aperçu ----------

function png(w, h, rgba) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function preview(frames, file, scale = 6) {
  const pad = 4;
  const cw = Math.max(...frames.map((f) => f[0].length)) + pad, ch = Math.max(...frames.map((f) => f.length)) + pad;
  const cols = Math.min(frames.length, 8), rowsN = Math.ceil(frames.length / cols);
  const W = cols * cw * scale, H = rowsN * ch * scale;
  const buf = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { buf[i * 4] = 0xdf; buf[i * 4 + 1] = 0xe5; buf[i * 4 + 2] = 0xec; buf[i * 4 + 3] = 255; }
  frames.forEach((f, n) => {
    const bx = (n % cols) * cw, by = Math.floor(n / cols) * ch + (ch - pad - f.length);
    f.forEach((row, y) => [...row].forEach((c, x) => {
      if (!PALETTE[c]) return;
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
        const o = (((by + y) * scale + sy) * W + (bx + x) * scale + sx) * 4;
        buf[o] = PALETTE[c][0]; buf[o + 1] = PALETTE[c][1]; buf[o + 2] = PALETTE[c][2];
      }
    }));
  });
  writeFileSync(file, png(W, H, buf));
}

// ---------- programme ----------

if (input) {
  const img = load(input);
  const { label, list } = sprites(img, expected);
  // taille de case commune à toute la planche (sinon les frames n'auraient pas la même résolution)
  const cell = forcedCell ?? cellSize(img, list);
  const frames = list.map((sp) => sample(img, sp, cell, offset(img, sp, 'x', cell), offset(img, sp, 'y', cell), label));
  console.log(`${path.basename(input)} : ${frames.length} frames, case de ${cell.toFixed(2)} px, tailles ${frames.map((f) => `${f[0].length}×${f.length}`).join(' ')}`);
  const out = opt('--out');
  if (out) writeFileSync(out, JSON.stringify({ source: path.basename(input), cell, frames }, null, 1));
  const pv = opt('--preview');
  if (pv) preview(frames, pv);
}
