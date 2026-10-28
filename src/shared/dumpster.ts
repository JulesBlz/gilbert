// Sa poubelle : une benne verte au raton (assets/dumpster.png, tools/make-dumpster.py). C'est l'icône de
// l'appli sur le bureau ; Gilbert en sort et y rentre, caché derrière son bord avant (`rim`). Les
// mesures sont des fractions de l'icône (un carré) : la benne (31 x 33 cases de 13 px) est centrée dans les 512 px de l'icône. `rim` : la hauteur du bord avant, en fraction de la benne.

/** Largeur / hauteur de la benne */
export const DUMP = { aspect: 31 / 33, top: 41 / 512, bottom: 470 / 512, rim: 0.45 };

/** Une benne dont l'icône (un carré de `size` px) a son haut à `top` et son milieu à `x` */
export function dumpBox(x: number, top: number, size: number) {
  const h = (DUMP.bottom - DUMP.top) * size;
  return {
    x,
    /** le bas de la benne : le sol */
    ground: top + DUMP.bottom * size,
    /** le bord avant : ce qui passe dessous est dans la benne */
    rim: top + (DUMP.top + (DUMP.bottom - DUMP.top) * DUMP.rim) * size,
    left: x - (h * DUMP.aspect) / 2,
    top: top + DUMP.top * size,
    w: h * DUMP.aspect,
    h,
    size,
  };
}
export type DumpBox = ReturnType<typeof dumpBox>;
