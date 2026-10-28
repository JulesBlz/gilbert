// Après `electron-builder --mac` : le fichier .dmg prend l'icône de l'installeur (la tête de Gilbert)
// dans le Finder. L'appli, elle, garde son icône de poubelle.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const icns = join(root, 'assets', 'installer.icns');
for (const f of readdirSync(join(root, 'release')).filter((n) => n.endsWith('.dmg'))) {
  const dmg = join(root, 'release', f);
  execFileSync('osascript', ['-l', 'JavaScript', '-e', `ObjC.import('AppKit');
    $.NSWorkspace.sharedWorkspace.setIconForFileOptions($.NSImage.alloc.initWithContentsOfFile(${JSON.stringify(icns)}), ${JSON.stringify(dmg)}, 0);`]);
  console.log(`icône de l'installeur → ${f}`);
}
