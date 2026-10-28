// L'installation, puis son icône sur le bureau.
// - L'installeur (le .dmg ou le .exe) a la tête de Gilbert, et ne sert qu'une fois : au premier lancement,
//   l'appli se copie SUR LE BUREAU (Mac), y prend l'icône de poubelle (sans fond : une icône posée à la
//   main n'a pas le carré gris que macOS met aux icônes d'appli), se relance de là, puis range l'installeur
//   (éjecté, à la corbeille : récupérable). Rien de tout ça ne demande d'autorisation.
//   Sous Windows, l'installeur crée le raccourci du bureau ; l'appli lui donne l'icône de poubelle.
// - Sa poubelle du bureau est sa maison (Mac) : Finder donne sa place et sa taille (c'est la seule chose
//   qui demande une autorisation, une fois). L'icône ne change jamais : Gilbert en sort au lancement,
//   caché derrière le bord avant de la benne, et y rentre quand on le lâche dessus.

import { app, screen, shell } from 'electron';
import type { Home } from '../shared/types';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const jxa = (script: string) => run('osascript', ['-l', 'JavaScript', '-e', script], { timeout: 10_000 }).then((r) => r.stdout.trim());

/** Le journal de l'installation (userData/install.log) : ce qui a été fait, et en combien de temps */
const t0 = Date.now();
const note = (what: string) => {
  try { appendFileSync(path.join(app.getPath('userData'), 'install.log'), `${((Date.now() - t0) / 1000).toFixed(1)} s  ${what}\n`); } catch { /* pas grave */ }
};

/** Le dossier Gilbert.app (l'exécutable est dans Gilbert.app/Contents/MacOS) */
const bundle = () => path.resolve(app.getPath('exe'), '..', '..', '..');
/** Gilbert.app sur le bureau : là où il vit (Mac) */
const deskApp = () => path.join(app.getPath('desktop'), 'Gilbert.app');
const same = (a: string, b: string) => { try { return realpathSync(a) === realpathSync(b); } catch { return false; } };
/** Sur un Mac, l'appli est sur le bureau (en développement ou depuis l'installeur : non) */
export const desktopSupported = () => process.platform === 'darwin' && app.isPackaged && same(bundle(), deskApp());
/** L'argument de relance : « tu viens d'être installé » */
export const FRESH = '--fresh';

/**
 * Son icône sur le bureau : son centre en px de la fenêtre de Gilbert, et sa taille (px), ou null.
 * La première fois, macOS demande s'il peut piloter le Finder : `wait` laisse le temps de répondre.
 */
export async function desktopHome(wait = 4000): Promise<Home | null> {
  if (!desktopSupported()) return null;
  const out = await run('osascript', ['-e', `tell application "Finder"
    if not (exists item "Gilbert.app" of desktop) then return ""
    set p to desktop position of item "Gilbert.app" of desktop
    set s to 64
    try
      set s to icon size of icon view options of window of desktop
    end try
    return ((item 1 of p) as text) & "," & ((item 2 of p) as text) & "," & (s as text)
  end tell`], { timeout: wait }).then((r) => r.stdout.trim(), () => '');
  const [x, y, size] = out.split(',').map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const area = screen.getPrimaryDisplay().workArea;
  return { x: x - area.x, y: y - area.y, size: Number.isFinite(size) && size > 0 ? size : 64, visible: await iconVisible(x, y) };
}

/**
 * Rien ne cache le point (x, y) du bureau ? On regarde les fenêtres affichées à l'écran (celles des
 * autres applis, pas les siennes) : s'il y en a une dessus, l'icône est cachée, et la poubelle de
 * Gilbert, qui flotte au-dessus de tout, doit se faire oublier.
 */
async function iconVisible(x: number, y: number) {
  const out = await jxa(`ObjC.import('CoreGraphics');
    const raw = $.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements, 0);
    const list = ObjC.deepUnwrap(ObjC.castRefToObject(raw));
    const hit = list.some((w) => w.kCGWindowLayer === 0 && w.kCGWindowOwnerPID !== ${process.pid}
      && ${x} >= w.kCGWindowBounds.X && ${x} <= w.kCGWindowBounds.X + w.kCGWindowBounds.Width
      && ${y} >= w.kCGWindowBounds.Y && ${y} <= w.kCGWindowBounds.Y + w.kCGWindowBounds.Height);
    hit ? 'covered' : 'visible'`).catch(() => 'visible');
  return out !== 'covered';
}

/** L'icône de poubelle (dans l'archive de l'appli), recopiée là où macOS et Windows peuvent la lire */
function binIcon(ext: 'png' | 'ico') {
  const file = path.join(app.getPath('userData'), `bin.${ext}`);
  writeFileSync(file, readFileSync(path.join(app.getAppPath(), 'assets', `bin.${ext}`)));
  return file;
}

/** L'icône de Gilbert sur le bureau : la poubelle (au cas où macOS l'aurait remplacée) */
export async function setHomeIcon() {
  if (!desktopSupported()) return;
  await jxa(`ObjC.import('AppKit');
    $.NSWorkspace.sharedWorkspace.setIconForFileOptions($.NSImage.alloc.initWithContentsOfFile(${JSON.stringify(binIcon('png'))}), ${JSON.stringify(deskApp())}, 0);`).catch(() => {});
}

/** Windows : le raccourci du bureau créé par l'installeur prend l'icône de poubelle */
async function binShortcutOnWindows() {
  const lnk = path.join(app.getPath('desktop'), 'Gilbert.lnk').replace(/'/g, "''");
  const ico = binIcon('ico').replace(/'/g, "''");
  await run('powershell', ['-NoProfile', '-Command',
    `if (Test-Path '${lnk}') { $s = (New-Object -ComObject WScript.Shell).CreateShortcut('${lnk}'); $s.IconLocation = '${ico},0'; $s.Save() }`]).catch(() => {});
}

/** L'installeur, d'après son nom : Gilbert-0.1.0-arm64.dmg, Gilbert Setup 0.1.0.exe */
const INSTALLER = /^Gilbert(-[\d.]+-\w+\.dmg| Setup [\d.]+\.exe)$/;

/** Mac : l'installeur encore ouvert (monté) est éjecté, puis part à la corbeille */
async function ejectInstaller() {
  const info = await run('sh', ['-c', 'hdiutil info -plist | plutil -convert json -o - -']).then((r) => JSON.parse(r.stdout), () => null);
  for (const img of info?.images ?? []) {
    const file = String(img['image-path'] ?? '');
    if (!INSTALLER.test(path.basename(file))) continue;
    for (const e of img['system-entities'] ?? []) {
      const mount = e['mount-point'];
      if (!mount) continue;
      // une fenêtre du Finder ouverte dessus peut le retenir un instant : on insiste, puis on force
      await run('hdiutil', ['detach', mount, '-force'], { timeout: 8000 }).catch(() => {});
    }
    if (existsSync(file)) await shell.trashItem(file).catch(() => {});
  }
}

/**
 * Tout premier geste, avant même d'ouvrir une fenêtre : ouverte ailleurs que sur le bureau (depuis
 * l'installeur), l'appli s'y copie, y prend l'icône de poubelle et s'y relance. Renvoie true si c'est
 * parti : le processus actuel doit alors s'effacer sans rien démarrer.
 */
export function moveToDesktop() {
  if (!app.isPackaged || process.platform !== 'darwin' || same(bundle(), deskApp())) return false;
  try {
    // une ancienne version (ou l'ancien raccourci « Gilbert » du bureau) fait place nette
    rmSync(deskApp(), { recursive: true, force: true });
    rmSync(path.join(app.getPath('desktop'), 'Gilbert'), { force: true });
    execFileSync('ditto', [bundle(), deskApp()], { timeout: 120_000 });
    // copiée à la main, elle ne doit pas rester « téléchargée » (sinon macOS la ré-examine)
    execFileSync('xattr', ['-dr', 'com.apple.quarantine', deskApp()], { timeout: 20_000 });
    execFileSync('osascript', ['-l', 'JavaScript', '-e', `ObjC.import('AppKit');
      $.NSWorkspace.sharedWorkspace.setIconForFileOptions($.NSImage.alloc.initWithContentsOfFile(${JSON.stringify(binIcon('png'))}), ${JSON.stringify(deskApp())}, 0);`], { timeout: 10_000 });
    // relancée une fois celle-ci partie (une seule instance à la fois)
    spawn('sh', ['-c', `sleep 1.5; open -n ${JSON.stringify(deskApp())} --args ${FRESH}`], { detached: true, stdio: 'ignore' }).unref();
    note('copiée sur le bureau');
    return true;
  } catch (e) {
    note(`copie sur le bureau ratée : ${e instanceof Error ? e.message.split('\n')[0] : e}`);
    return false; // pas les droits : on continue d'où elle est
  }
}

/**
 * Premier lancement de l'appli posée sur le bureau : l'installeur est rangé, les restes des anciennes
 * versions aussi. `done` : tout est en place.
 */
export async function finishInstall() {
  if (!app.isPackaged) return { done: true };
  note('début');
  if (process.platform === 'darwin') await ejectInstaller();
  note('installeur éjecté');
  // l'installeur resté dans Téléchargements (ou sur le bureau)
  for (const dir of [app.getPath('downloads'), app.getPath('desktop')]) {
    try {
      for (const f of readdirSync(dir)) if (INSTALLER.test(f)) await shell.trashItem(path.join(dir, f)).catch(() => {});
    } catch { /* dossier absent */ }
  }
  note('Téléchargements et bureau parcourus');
  if (process.platform === 'win32') {
    await binShortcutOnWindows();
    return { done: true };
  }
  // l'ancienne copie rangée dans Applications
  await shell.trashItem('/Applications/Gilbert.app').catch(() => {});
  await setHomeIcon();
  note('poubelle posée');
  return { done: true };
}
