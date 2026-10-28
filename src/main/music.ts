// La musique : ce qui joue dans Spotify (ou Musique sur Mac, n'importe quel lecteur sur Windows),
// et les commandes lecture / pause / suivant. Tout passe par l'appli elle-même, sur la machine :
// pas de compte développeur Spotify, rien n'est envoyé ailleurs.

import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { scriptDir } from './vision/capture';

export interface Track {
  player: string;
  playing: boolean;
  title: string;
  artist: string;
  album: string;
}

export type MusicCommand = 'status' | 'playpause' | 'next' | 'previous';

const POLL_MS = 15_000;
const NOTHING: Track = { player: '', playing: false, title: '', artist: '', album: '' };

export class Music extends EventEmitter {
  track: Track = NOTHING;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  /** Le premier relevé (au lancement) ne compte pas comme un nouveau morceau */
  private seen = false;

  start() {
    if (this.timer || !(process.platform === 'darwin' || process.platform === 'win32')) return;
    this.timer = setInterval(() => this.run('status').catch(() => {}), POLL_MS);
    this.run('status').catch(() => {});
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Lance une commande et renvoie ce qui joue ensuite */
  async run(cmd: MusicCommand): Promise<Track> {
    if (cmd === 'status' && this.busy) return this.track;
    this.busy = true;
    try {
      const t = { ...NOTHING, ...JSON.parse(await script(cmd)) } as Track;
      const changed = t.title !== this.track.title || t.artist !== this.track.artist;
      const was = this.track;
      this.track = t;
      if (changed || t.playing !== was.playing) this.emit('change', t);
      // nouveau morceau (pas juste une reprise après pause)
      if (changed && t.title && t.playing && this.seen) this.emit('track', t, cmd !== 'status');
      this.seen = true;
      return t;
    } catch {
      return this.track;
    } finally {
      this.busy = false;
    }
  }
}

function script(cmd: MusicCommand) {
  const dir = scriptDir();
  const [bin, args] = process.platform === 'darwin'
    ? ['osascript', ['-l', 'JavaScript', path.join(dir, 'mac-music.js'), cmd]]
    : ['powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(dir, 'win-music.ps1'), cmd]];
  return new Promise<string>((resolve, reject) => {
    execFile(bin, args as string[], { timeout: 10_000, windowsHide: true }, (err, out) => (err ? reject(err) : resolve(out)));
  });
}

/** « I Only Smoke When I Drink » de nimino */
export function describe(t: Track, lang: 'fr' | 'en' | 'vi') {
  if (!t.title) return '';
  return { fr: `« ${t.title} » de ${t.artist}`, en: `"${t.title}" by ${t.artist}`, vi: `« ${t.title} » của ${t.artist}` }[lang];
}
