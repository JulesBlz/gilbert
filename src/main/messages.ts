// Les messageries (Mac) : WhatsApp, Messages, Signal, Telegram. Gilbert ne lit pas tes messages : il
// regarde seulement la pastille rouge de leur icône (le nombre de non-lus, via `lsappinfo`). Quand il
// augmente alors que l'appli n'est pas au premier plan, il sursaute avec son « ! ».

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const APPS = ['WhatsApp', 'Messages', 'Signal', 'Telegram'];
const POLL_MS = 5000;

/** Le nombre affiché sur la pastille de l'appli (0 sans pastille ou si elle n'est pas ouverte) */
async function badge(app: string) {
  const { stdout } = await run('lsappinfo', ['info', '-only', 'StatusLabel', app]).catch(() => ({ stdout: '' }));
  const label = stdout.match(/"label"="([^"]*)"/)?.[1] ?? '';
  // « • » ou un nombre : une pastille sans nombre compte pour un
  return label ? Number.parseInt(label, 10) || 1 : 0;
}

async function frontApp() {
  const { stdout: asn } = await run('lsappinfo', ['front']).catch(() => ({ stdout: '' }));
  if (!asn.trim()) return '';
  const { stdout } = await run('lsappinfo', ['info', '-only', 'name', asn.trim()]).catch(() => ({ stdout: '' }));
  return stdout.match(/"LSDisplayName"="([^"]*)"/)?.[1] ?? '';
}

export class MessageBadges {
  private counts = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;

  /** `onNew(app, unread)` : de nouveaux messages sont arrivés dans `app` */
  constructor(private onNew: (app: string, unread: number) => void) {}

  static supported() {
    return process.platform === 'darwin';
  }

  setEnabled(on: boolean) {
    if (!MessageBadges.supported()) return;
    if (on && !this.timer) {
      this.counts.clear();
      this.timer = setInterval(() => this.poll().catch(() => {}), POLL_MS);
      this.poll(true).catch(() => {});
    }
    if (!on && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** `first` : on note les non-lus déjà là, sans prévenir */
  private async poll(first = false) {
    const front = first ? '' : await frontApp();
    for (const app of APPS) {
      const n = await badge(app);
      const before = this.counts.get(app) ?? 0;
      this.counts.set(app, n);
      if (!first && n > before && front !== app) this.onNew(app, n);
    }
  }
}
