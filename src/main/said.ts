// L'historique des bulles : tout ce que Gilbert dit à l'écran est gardé dans said.json, sur la machine,
// pour retrouver une phrase qu'on a fermée sans le vouloir. Les 300 dernières seulement.

import { app } from 'electron';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { SaidEntry } from '../shared/types';

const file = () => path.join(app.getPath('userData'), 'said.json');
const KEEP = 300;
const MAX_LEN = 4000;

export class SaidStore {
  private items: SaidEntry[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    try {
      const saved = JSON.parse(readFileSync(file(), 'utf8')) as SaidEntry[];
      if (Array.isArray(saved)) this.items = saved.filter((x) => x && typeof x.text === 'string' && typeof x.at === 'number').slice(-KEEP);
    } catch { /* premier lancement */ }
  }

  /** Le plus récent d'abord */
  list(): SaidEntry[] {
    return [...this.items].reverse();
  }

  add(text: string) {
    const t = text.trim().slice(0, MAX_LEN);
    if (!t) return;
    const last = this.items[this.items.length - 1];
    // une phrase redite aussitôt (bulle rouverte) ne compte qu'une fois
    if (last && last.text === t && Date.now() - last.at < 10_000) return;
    this.items.push({ at: Date.now(), text: t });
    if (this.items.length > KEEP) this.items = this.items.slice(-KEEP);
    this.save();
  }

  clear() {
    this.items = [];
    this.save();
  }

  private save() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        mkdirSync(path.dirname(file()), { recursive: true });
        const tmp = `${file()}.tmp`;
        writeFileSync(tmp, JSON.stringify(this.items));
        renameSync(tmp, file());
      } catch { /* pas grave : au prochain changement */ }
    }, 400);
  }
}
