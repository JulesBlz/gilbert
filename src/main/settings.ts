import { app } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, type Settings } from '../shared/types';

const file = () => path.join(app.getPath('userData'), 'settings.json');

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(readFileSync(file(), 'utf8'));
    // `scale` vient de la première version (sprites 32×32), remplacé par `size`
    delete saved.scale;
    // `hideAfter` (en minutes) remplacé par `hideAfterSec`
    delete saved.hideAfter;
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let timer: NodeJS.Timeout | null = null;

/** Sauvegarde différée : regroupe les écritures rapprochées (déplacements de Gilbert) */
export function saveSettings(s: Settings, immediate = false) {
  if (timer) clearTimeout(timer);
  const write = () => {
    mkdirSync(path.dirname(file()), { recursive: true });
    writeFileSync(file(), JSON.stringify(s, null, 2));
  };
  if (immediate) write();
  else timer = setTimeout(write, 1000);
}
