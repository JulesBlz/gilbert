// Petits dessins pixel partagés par Gilbert et sa fenêtre : les glands gagnés en sessions de travail
// (et le rare gland doré). Chaque dessin est une grille de lettres, une lettre par couleur.

export const PALETTE: Record<string, string> = {
  K: '#14191f', D: '#2a3137', E: '#3c4248', B: '#646a6e', L: '#919498', W: '#e4dcd4', O: '#f8f8f6',
  P: '#e58aa0', Y: '#e2b84a', R: '#c2463c', G: '#5d8a4a', A: '#4a78b8', N: '#8a5a34', T: '#c9a26b', S: '#b8bcc0',
  // la poubelle : un métal bleuté (base, reflet, ombre)
  H: '#909eab', J: '#acb8c6', V: '#63788d', Q: '#7e8fa0',
};

// ---------- les glands ----------
// Un gland par minute de session de travail (même arrêtée en route). Une session menée jusqu'au
// bout a en plus une petite chance de rapporter un gland doré. Plus tard : de quoi s'offrir des skins.

export const ACORN = ['....KK....', '...KNK....', '.KKKKKKK..', 'KTTTTTTTK.', 'KTNTNTNTK.', '.KKKKKKK..', '.KNNNNNK..', '.KNNLNNK..', '..KNNNK...', '...KKK....'];
export const GOLDEN_ACORN = ['....KK....', '...KNK....', '.KKKKKKK..', 'KYYOYYYYK.', 'KYNYNYNYK.', '.KKKKKKK..', '.KYYOYYK..', '.KYYYYYK..', '..KYYYK...', '...KKK....'];

/** Chance, par minute de session terminée, que le gland du jour soit doré (≈ 5 % sur 25 min) */
const GOLDEN_PER_MINUTE = 0.002;

export function goldenAcorn(minutes: number, random = Math.random) {
  return random() < 1 - (1 - GOLDEN_PER_MINUTE) ** minutes;
}

/**
 * Dessine une grille de lettres sur un canevas, chaque case faisant `scale` pixels. Les bords sont
 * arrondis au pixel près : à une échelle non entière (un dessin à une taille quelconque),
 * pas de fines lignes entre deux cases.
 */
export function drawGrid(ctx: CanvasRenderingContext2D, grid: string[], x: number, y: number, scale: number, flip = false) {
  const w = Math.max(...grid.map((r) => r.length));
  grid.forEach((row, j) => [...row].forEach((c, i) => {
    const color = PALETTE[c];
    if (!color) return;
    const col = flip ? w - 1 - i : i;
    const x0 = Math.round(x + col * scale), y0 = Math.round(y + j * scale);
    ctx.fillStyle = color;
    ctx.fillRect(x0, y0, Math.round(x + (col + 1) * scale) - x0, Math.round(y + (j + 1) * scale) - y0);
  }));
}
