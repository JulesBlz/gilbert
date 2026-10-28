// Petits symboles pixel dessinés au-dessus de Gilbert (alerte, sommeil…)

const GLYPHS = {
  '!': ['#', '#', '#', '.', '#'],
  Z: ['####', '..#.', '.#..', '####'],
  '?': ['.##.', '#..#', '..#.', '....', '..#.'],
} as const;

export type Glyph = keyof typeof GLYPHS;

/** Dessine un symbole avec un contour d'un pixel. (x, y) = coin haut-gauche, s = taille d'un pixel. */
export function drawGlyph(
  ctx: CanvasRenderingContext2D, g: Glyph, x: number, y: number, s: number,
  fill: string, ink = '#2b1d14',
) {
  const rows = GLYPHS[g];
  const plot = (color: string, dx: number, dy: number) => {
    ctx.fillStyle = color;
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        if (row[i] === '#') ctx.fillRect(x + (i + dx) * s, y + (j + dy) * s, s, s);
      }
    });
  };
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) plot(ink, dx, dy);
  plot(fill, 0, 0);
}
