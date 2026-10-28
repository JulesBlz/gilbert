// Avant `electron-builder --mac` : le fond de la fenêtre de l'installeur. Une seule consigne, sous
// l'icône de Gilbert : double-clic, il s'occupe de tout (pas de dossier Applications où glisser).
// Dessiné par AppKit (police du système), en 1× et en 2× pour les écrans Retina.
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 540, H = 360;
for (const [scale, name] of [[1, 'dmg-background.png'], [2, 'dmg-background@2x.png']]) {
  const out = join(root, 'assets', name);
  execFileSync('osascript', ['-l', 'JavaScript', '-e', `ObjC.import('AppKit');
    const s = ${scale}, W = ${W} * s, H = ${H} * s;
    const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(null, W, H, 8, 4, true, false, $.NSDeviceRGBColorSpace, 0, 0);
    $.NSGraphicsContext.saveGraphicsState;
    $.NSGraphicsContext.setCurrentContext($.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep));
    $.NSColor.colorWithSRGBRedGreenBlueAlpha(0xf1 / 255, 0xea / 255, 0xdf / 255, 1).setFill;
    $.NSRectFill($.NSMakeRect(0, 0, W, H));
    const ink = $.NSColor.colorWithSRGBRedGreenBlueAlpha(0x14 / 255, 0x19 / 255, 0x1f / 255, 1);
    const muted = $.NSColor.colorWithSRGBRedGreenBlueAlpha(0x7d / 255, 0x74 / 255, 0x6a / 255, 1);
    const text = (str, size, weight, color, y) => {
      const attrs = $.NSMutableDictionary.dictionary;
      attrs.setObjectForKey($.NSFont.systemFontOfSizeWeight(size * s, weight), 'NSFont');
      attrs.setObjectForKey(color, 'NSColor');
      // centré à la main : on mesure le texte
      const width = $(str).sizeWithAttributes(attrs).width;
      $(str).drawAtPointWithAttributes($.NSMakePoint((W - width) / 2, y * s), attrs);
    };
    text('Double-clique sur Gilbert', 22, 0.4, ink, 78);
    text('Il s’occupe de tout, tu n’as rien d’autre à faire.', 13, 0, muted, 52);
    $.NSGraphicsContext.restoreGraphicsState;
    rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $()).writeToFileAtomically(${JSON.stringify(out)}, true);`]);
}
console.log('fond de l’installeur → assets/dmg-background.png');
