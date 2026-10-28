// Ce que Gilbert voit : l'appli au premier plan, et le texte de sa fenêtre.
// La lecture se fait avec la reconnaissance de texte du système (Vision sur Mac, Windows.Media.Ocr
// sur Windows), sur la machine. L'image est effacée aussitôt lue, le texte n'est jamais enregistré.

import { app, desktopCapturer, screen, systemPreferences, type BrowserWindow, type Rectangle } from 'electron';
import { execFile } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface FrontWindow {
  app: string;
  /** Identifiant de l'appli (Mac) ou nom du programme (Windows) */
  bundle: string;
  pid: number;
  title: string;
  /** Position de la fenêtre, en coordonnées d'écran d'Electron ; null si aucune fenêtre visible */
  bounds: Rectangle | null;
}

/** Une fois installé, l'appli est dans une archive (app.asar) : les scripts sont copiés à côté, lisibles par le système */
export const scriptDir = () => path.join(__dirname.replace(/app\.asar(?=[\\/]|$)/, 'app.asar.unpacked'), 'vision');
const script = (name: string) => path.join(scriptDir(), name);

function run(cmd: string, args: string[], timeout = 15_000) {
  return new Promise<string>((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, out) => (err ? reject(err) : resolve(out)));
  });
}

function runScript(name: string, args: string[] = []) {
  if (process.platform === 'darwin') return run('osascript', ['-l', 'JavaScript', script(name), ...args]);
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script(name), ...args]);
}

export const supported = () => process.platform === 'darwin' || process.platform === 'win32';

/** La permission de voir l'écran (Mac : « Enregistrement de l'écran ») ; toujours accordée sous Windows */
export function permission(): 'granted' | 'denied' | 'not-determined' | 'unsupported' {
  if (!supported()) return 'unsupported';
  if (process.platform !== 'darwin') return 'granted';
  const s = systemPreferences.getMediaAccessStatus('screen');
  return s === 'granted' || s === 'not-determined' ? s : 'denied';
}

/** Mac : une première capture fait apparaître Gilbert dans la liste des applis à autoriser */
export async function askPermission() {
  if (process.platform !== 'darwin') return;
  await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }).catch(() => {});
}

export async function frontWindow(): Promise<FrontWindow | null> {
  if (!supported()) return null;
  try {
    const w = JSON.parse(await runScript(process.platform === 'darwin' ? 'mac-front.js' : 'win-front.ps1')) as FrontWindow;
    // Windows donne des pixels physiques ; Electron travaille en pixels « logiques »
    if (w.bounds && process.platform === 'win32') w.bounds = screen.screenToDipRect(null, w.bounds);
    return w;
  } catch {
    return null;
  }
}

/**
 * Lit le texte de la fenêtre `front`. Gilbert lui-même (sa fenêtre transparente) est masqué de la
 * capture le temps de la prise, pour qu'il ne lise pas ses propres bulles.
 */
export async function readWindow(front: FrontWindow, own: BrowserWindow | null): Promise<string[]> {
  const b = front.bounds;
  if (!b) return [];
  const display = screen.getDisplayMatching(b);
  const size = { width: Math.round(display.bounds.width * display.scaleFactor), height: Math.round(display.bounds.height * display.scaleFactor) };
  own?.setContentProtection(true);
  let sources: Electron.DesktopCapturerSource[];
  try {
    await new Promise((r) => setTimeout(r, 80));
    sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  } finally {
    own?.setContentProtection(false);
  }
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
  if (!source) return [];
  const shot = source.thumbnail;
  const scale = shot.getSize().width / display.bounds.width;
  const x = Math.max(0, Math.round((b.x - display.bounds.x) * scale));
  const y = Math.max(0, Math.round((b.y - display.bounds.y) * scale));
  const crop = {
    x, y,
    width: Math.min(Math.round(b.width * scale), shot.getSize().width - x),
    height: Math.min(Math.round(b.height * scale), shot.getSize().height - y),
  };
  if (crop.width < 40 || crop.height < 40) return [];
  return ocr(shot.crop(crop).toPNG());
}

/** Texte d'une image PNG, ligne par ligne, de haut en bas */
export async function ocr(png: Buffer): Promise<string[]> {
  const file = path.join(app.getPath('temp'), `gilbert-look-${process.pid}.png`);
  writeFileSync(file, png);
  try {
    const out = JSON.parse(await runScript(process.platform === 'darwin' ? 'mac-ocr.js' : 'win-ocr.ps1', [file])) as {
      lines: (string | { text: string; x: number; y: number; h: number })[];
    };
    const lines = out.lines.map((l) => (typeof l === 'string' ? { text: l, x: 0, y: 0, h: 0 } : l));
    // même ligne visuelle (hauteurs proches) : de gauche à droite
    lines.sort((a, b) => (Math.abs(a.y - b.y) < Math.max(a.h, b.h) * 0.5 ? a.x - b.x : a.y - b.y));
    return lines.map((l) => l.text.trim()).filter(Boolean);
  } catch {
    return [];
  } finally {
    rmSync(file, { force: true });
  }
}
