// La pluie de glands : ceux qu'on vient de gagner tombent du haut de l'écran, rebondissent et restent
// au sol jusqu'à ce qu'on passe la souris dessus. Chaque gland qu'on ramasse monte en scintillant et
// ne compte dans le solde qu'à ce moment-là. Ceux qu'on laisse sont retrouvés au prochain lancement.

import { ACORN, drawGrid } from '../shared/pixels';
import { sfx } from './audio';

type Item = {
  x: number; y: number; vx: number; vy: number;
  value: number;
  state: 'fall' | 'rest' | 'taken';
  /** secondes avant d'apparaître (la pluie est étalée) */
  delay: number;
  /** temps depuis l'apparition (ou depuis le ramassage) */
  t: number;
  bounces: number;
  spin: number; spinV: number;
  /** où il se pose (hauteur du haut du gland) */
  floor: number;
};

const GRID = 10;
const GRAVITY = 1500;
const MAX_ITEMS = 36;
const MAX_DROPS = 18;

export class AcornField {
  private items: Item[] = [];
  /** Des glands ramassés : combien */
  onCollect: ((acorns: number) => void) | null = null;
  private combo = 0;
  private lastPick = 0;
  private sparkle = 0;

  constructor(private cell: () => number) {}

  get active() { return this.items.length > 0; }

  private size() { return GRID * this.cell(); }

  private floor() {
    return innerHeight - this.size() - 2 - Math.random() * this.cell() * 2.5;
  }

  /** Une averse : `acorns` glands répartis sur au plus 18 grains */
  rain(acorns: number, settled = false) {
    const count = Math.min(acorns, MAX_DROPS);
    for (let i = 0; i < count; i++) {
      const value = Math.floor(acorns / count) + (i < acorns % count ? 1 : 0);
      this.spawn(value, i * (1.6 / Math.max(count, 1)) + Math.random() * 0.25, settled);
    }
    this.merge();
  }

  private spawn(value: number, delay: number, settled: boolean) {
    const w = innerWidth;
    const x = w * (0.12 + Math.random() * 0.76);
    const floor = this.floor();
    this.items.push({
      x, y: settled ? floor : -this.size() - Math.random() * 60, vx: (Math.random() - 0.5) * 50, vy: 40 + Math.random() * 60,
      value, state: settled ? 'rest' : 'fall', delay: settled ? 0 : delay, t: 0, bounces: 0,
      spin: Math.random() * Math.PI * 2, spinV: (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 5), floor,
    });
  }

  /** Trop de grains à l'écran : les plus anciens se regroupent */
  private merge() {
    while (this.items.length > MAX_ITEMS) {
      const rest = this.items.filter((i) => i.state === 'rest');
      if (rest.length < 2) break;
      rest[1].value += rest[0].value;
      this.items.splice(this.items.indexOf(rest[0]), 1);
    }
  }

  /** Le gland posé le plus proche de `x` (pour que Gilbert aille le chercher) */
  nearest(x: number) {
    const rest = this.items.filter((i) => i.state === 'rest');
    rest.sort((p, q) => Math.abs(p.x - x) - Math.abs(q.x - x));
    return rest[0] ? { x: rest[0].x, y: rest[0].y + this.size() / 2 } : null;
  }

  /** La souris passe : un gland sous elle est ramassé */
  pointer(px: number, py: number) {
    const s = this.size(), reach = s * 0.62;
    for (const it of this.items) {
      if (it.state === 'taken' || it.delay > 0) continue;
      if (Math.abs(px - it.x) > reach || Math.abs(py - (it.y + s / 2)) > reach) continue;
      it.state = 'taken';
      it.t = 0;
      it.vy = -240;
      const now = performance.now();
      this.combo = now - this.lastPick < 900 ? Math.min(this.combo + 1, 9) : 0;
      this.lastPick = now;
      sfx.pickup(this.combo);
      this.onCollect?.(it.value);
    }
  }

  update(dt: number) {
    const s = this.size();
    for (const it of this.items) {
      if (it.delay > 0) { it.delay -= dt; continue; }
      it.t += dt;
      if (it.state === 'fall') {
        it.vy += GRAVITY * dt;
        it.y += it.vy * dt;
        it.x += it.vx * dt;
        it.spin += it.spinV * dt;
        if (it.y >= it.floor) {
          it.y = it.floor;
          if (it.bounces < 2 && it.vy > 140) {
            // rebond : de moins en moins haut, en perdant son élan de côté
            it.vy = -it.vy * (it.bounces === 0 ? 0.42 : 0.3);
            it.vx *= 0.5;
            it.bounces++;
            sfx.acornLand();
          } else {
            it.state = 'rest';
            it.vx = it.vy = 0;
            it.t = 0;
            sfx.acornLand();
          }
        }
        it.x = Math.min(Math.max(it.x, s / 2), innerWidth - s / 2);
      } else if (it.state === 'taken') {
        it.vy *= 1 - Math.min(dt * 5, 1);
        it.y += it.vy * dt;
      }
    }
    this.items = this.items.filter((i) => !(i.state === 'taken' && i.t > 0.7));
    this.sparkle += dt;
  }

  /** Dessine tout, et renvoie la zone touchée (ou null) pour l'effacer à la frame suivante */
  draw(ctx: CanvasRenderingContext2D) {
    const c = this.cell(), s = GRID * c;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const reach = (x: number, y: number, w: number, h: number) => {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h);
    };
    for (const it of this.items) {
      if (it.delay > 0) continue;
      const grid = ACORN;
      ctx.save();
      if (it.state === 'taken') {
        // il monte, grossit un peu, s'efface ; quatre étincelles partent en croix
        const p = Math.min(it.t / 0.55, 1);
        ctx.globalAlpha = 1 - p * p;
        const k = 1 + p * 0.45;
        ctx.translate(it.x, it.y + s / 2);
        ctx.scale(k, k);
        drawGrid(ctx, grid, Math.round(-s / 2), Math.round(-s / 2), c);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = 1 - p;
        ctx.fillStyle = '#ffe9a0';
        const r = s * 0.35 + p * s * 0.9, d = c;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7]]) {
          ctx.fillRect(Math.round(it.x + dx * r - d / 2), Math.round(it.y + s / 2 + dy * r - d / 2), d, d);
        }
        // « +n » qui monte
        ctx.globalAlpha = Math.min(1, (1 - p) * 2);
        // le « +n » : la police de l'interface, à 18 px (pixels de 2 px)
        ctx.font = '18px "Jersey 10", ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#2b1d14';
        const label = `+${it.value}`;
        const ty = it.y - p * s * 0.9;
        ctx.strokeText(label, it.x, ty);
        ctx.fillStyle = '#f6c75c';
        ctx.fillText(label, it.x, ty);
        reach(it.x - r - d, it.y + s / 2 - r - d - s, 2 * r + 2 * d + 20, 2 * r + 2 * d + s);
        ctx.restore();
        continue;
      }
      // en l'air, le gland tourne sur lui-même (on le comprime en largeur) ; au sol, il se pose
      const w = it.state === 'fall' ? Math.max(0.25, Math.abs(Math.cos(it.spin))) : 1;
      // au contact du sol, il s'écrase un instant
      const squash = it.state === 'rest' && it.t < 0.1 ? 1 + (0.1 - it.t) * 1.2 : 1;
      ctx.translate(it.x, it.y + s);
      ctx.scale(w * squash, 1 / squash);
      drawGrid(ctx, grid, Math.round(-s / 2), -s, c);
      // une ombre sous le gland posé
      ctx.restore();
      if (it.state === 'rest') {
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#000';
        ctx.fillRect(Math.round(it.x - s * 0.32), Math.round(it.y + s), Math.round(s * 0.64), Math.max(2, Math.round(c * 0.8)));
        ctx.restore();
      }
      reach(it.x - s * 0.8, it.y - 4, s * 1.6, s + c * 3 + 4);
    }
    return x0 === Infinity ? null : { x: Math.floor(x0) - 2, y: Math.floor(y0) - 2, w: Math.ceil(x1 - x0) + 4, h: Math.ceil(y1 - y0) + 4 };
  }
}
