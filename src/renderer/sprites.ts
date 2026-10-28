// Planche de sprites générée par tools/gen-sprites.mjs, habillée selon la boutique (pelage, accessoire)

import sheetUrl from '../../assets/gilbert.png';
import atlas from '../../assets/gilbert.json';
import { paintSkin, type Skin } from '../shared/skins';

export type FrameName = keyof typeof atlas.frames;
export const SIZE = atlas.size;

let sheet: HTMLCanvasElement;
let alpha: Uint8ClampedArray;
let sheetWidth = 0;
/** La planche d'origine, pour la rhabiller */
let original: ImageData;
let worn = '';

export async function loadSprites(skin: Skin) {
  const img = new Image();
  // onload plutôt que decode() : decode() peut ne jamais se résoudre dans certaines fenêtres
  await new Promise((ok, fail) => {
    img.onload = ok;
    img.onerror = fail;
    img.src = sheetUrl;
  });
  sheet = document.createElement('canvas');
  sheet.width = img.width;
  sheet.height = img.height;
  const ctx = sheet.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  original = ctx.getImageData(0, 0, img.width, img.height);
  sheetWidth = img.width;
  wearSkin(skin);
}

/** Change de pelage ou d'accessoire : la planche est repeinte une fois, le reste la dessine comme avant */
export function wearSkin(skin: Skin) {
  const key = `${skin.fur}/${skin.accessory}`;
  if (key === worn || !original) return;
  worn = key;
  const painted = paintSkin(original, atlas, skin);
  sheet.getContext('2d')!.putImageData(painted, 0, 0);
  alpha = painted.data;
}

function origin(name: FrameName): [number, number] {
  const i = atlas.frames[name];
  return [(i % atlas.cols) * SIZE, Math.floor(i / atlas.cols) * SIZE];
}

export function drawFrame(
  ctx: CanvasRenderingContext2D, name: FrameName,
  left: number, top: number, scale: number, flip: boolean,
) {
  const [sx, sy] = origin(name);
  const s = SIZE * scale;
  if (!flip) {
    ctx.drawImage(sheet, sx, sy, SIZE, SIZE, left, top, s, s);
    return;
  }
  ctx.save();
  ctx.translate(left + s, top);
  ctx.scale(-1, 1);
  ctx.drawImage(sheet, sx, sy, SIZE, SIZE, 0, 0, s, s);
  ctx.restore();
}

/** Le pixel (px, py) de la frame est-il opaque ? Coordonnées en pixels du sprite. */
export function isOpaque(name: FrameName, px: number, py: number, flip: boolean) {
  if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) return false;
  const [sx, sy] = origin(name);
  const x = flip ? SIZE - 1 - px : px;
  return alpha[((sy + py) * sheetWidth + sx + x) * 4 + 3] > 0;
}

/** Position de la base assise dans la frame (en pixels de Gilbert) */
export const BASE = atlas.base;

/** Hauteur (pixels de Gilbert) de la queue qui pend du haut de l'écran */
export const HANG_LENGTH = atlas.hangLength;

/** Pendu articulé : bout et base de la queue, accroche du corps, hauteur du corps (pixels de frame) */
export const GRAB = atlas.grab as { tailTip: [number, number]; tailBase: [number, number]; bodyJoint: [number, number]; bodyHeight: number };

/** Dessine une frame tournée de `angle` (radians, sens horaire) autour du point (ax, ay) de la frame, posé en (px, py) */
export function drawFrameRotated(
  ctx: CanvasRenderingContext2D, name: FrameName,
  px: number, py: number, ax: number, ay: number, scale: number, angle: number,
) {
  const [sx, sy] = origin(name);
  ctx.save();
  ctx.translate(Math.round(px), Math.round(py));
  ctx.rotate(angle);
  ctx.drawImage(sheet, sx, sy, SIZE, SIZE, -ax * scale, -ay * scale, SIZE * scale, SIZE * scale);
  ctx.restore();
}
