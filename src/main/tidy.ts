// Le rangeur de Téléchargements : quand des fichiers traînent depuis plus de 2 jours, Gilbert
// propose de les ranger par type, dans des sous-dossiers du dossier Téléchargements lui-même
// (Documents, Images, Installeurs…). Il ne supprime jamais rien, ne touche à rien sans ton accord,
// et le dernier rangement peut être annulé.

import { app } from 'electron';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Lang } from '../shared/types';

type Kind = 'documents' | 'images' | 'videos' | 'audio' | 'archives' | 'installers' | 'code' | 'other';

const EXT: Record<Exclude<Kind, 'other'>, RegExp> = {
  documents: /\.(pdf|docx?|odt|rtf|txt|md|pages|xlsx?|csv|numbers|ods|pptx?|key|odp|epub)$/i,
  images: /\.(png|jpe?g|gif|heic|webp|svg|bmp|tiff?|psd|ai|fig)$/i,
  videos: /\.(mp4|mov|avi|mkv|webm|m4v)$/i,
  audio: /\.(mp3|wav|m4a|aac|flac|ogg|aiff?)$/i,
  archives: /\.(zip|rar|7z|tar|gz|tgz|bz2|xz)$/i,
  installers: /\.(dmg|pkg|exe|msi|appimage|deb|rpm|apk)$/i,
  code: /\.(js|ts|py|json|html?|css|sh|ipynb|sql|xml|ya?ml)$/i,
};

export const FOLDER: Record<Kind, Record<Lang, string>> = {
  documents: { fr: 'Documents', en: 'Documents', vi: 'Tài liệu' },
  images: { fr: 'Images', en: 'Images', vi: 'Hình ảnh' },
  videos: { fr: 'Vidéos', en: 'Videos', vi: 'Video' },
  audio: { fr: 'Audio', en: 'Audio', vi: 'Âm thanh' },
  archives: { fr: 'Archives', en: 'Archives', vi: 'Tệp nén' },
  installers: { fr: 'Installeurs', en: 'Installers', vi: 'Bộ cài đặt' },
  code: { fr: 'Code', en: 'Code', vi: 'Mã nguồn' },
  other: { fr: 'Autres', en: 'Other', vi: 'Khác' },
};

const OLDER_THAN = 2 * 86_400_000;
const AT_LEAST = 15;
const file = () => path.join(app.getPath('userData'), 'tidy.json');

const kindOf = (name: string): Kind => (Object.entries(EXT).find(([, re]) => re.test(name))?.[0] as Kind) ?? 'other';

interface Saved {
  lastOffer: number;
  /** Le dernier rangement, pour pouvoir l'annuler */
  moves: { from: string; to: string }[];
}

export class Tidy {
  private saved: Saved;

  constructor(private dir = app.getPath('downloads')) {
    try {
      this.saved = { lastOffer: 0, moves: [], ...JSON.parse(readFileSync(file(), 'utf8')) };
    } catch {
      this.saved = { lastOffer: 0, moves: [] };
    }
  }

  private save() {
    writeFileSync(file(), JSON.stringify(this.saved));
  }

  /** Les fichiers qui traînent à la racine depuis plus de 2 jours (téléchargements en cours exclus) */
  loose(now = Date.now()) {
    let names: string[] = [];
    try { names = readdirSync(this.dir); } catch { return []; }
    return names.filter((n) => !n.startsWith('.') && !/\.(crdownload|part|download|tmp)$/i.test(n)).flatMap((n) => {
      try {
        const st = statSync(path.join(this.dir, n));
        return st.isFile() && now - st.mtimeMs > OLDER_THAN ? [{ name: n, kind: kindOf(n) }] : [];
      } catch {
        return [];
      }
    });
  }

  /** De quoi proposer un rangement (au plus tous les 3 jours ; `asked` : demandé à l'instant), ou null */
  proposal(now = Date.now(), asked = false) {
    if (!asked && now - this.saved.lastOffer < 3 * 86_400_000) return null;
    const files = this.loose(now);
    if (files.length < (asked ? 1 : AT_LEAST)) return null;
    this.saved.lastOffer = now;
    this.save();
    const counts = new Map<Kind, number>();
    for (const f of files) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
    return { total: files.length, counts: [...counts.entries()].sort((a, b) => b[1] - a[1]) };
  }

  /** Range par type ; renvoie le nombre de fichiers déplacés et de dossiers utilisés */
  run(lang: Lang) {
    const moves: Saved['moves'] = [];
    const used = new Set<string>();
    for (const f of this.loose()) {
      const folder = path.join(this.dir, FOLDER[f.kind][lang]);
      mkdirSync(folder, { recursive: true });
      // jamais d'écrasement : « facture (2).pdf »
      const ext = path.extname(f.name), base = f.name.slice(0, f.name.length - ext.length);
      let to = path.join(folder, f.name);
      for (let i = 2; existsSync(to); i++) to = path.join(folder, `${base} (${i})${ext}`);
      try {
        renameSync(path.join(this.dir, f.name), to);
        moves.push({ from: path.join(this.dir, f.name), to });
        used.add(folder);
      } catch { /* fichier ouvert ou protégé : on le laisse */ }
    }
    this.saved.moves = moves;
    this.save();
    return { moved: moves.length, folders: used.size };
  }

  /** Remet le dernier rangement comme avant (ce qui a bougé depuis est laissé tel quel) */
  undo() {
    let back = 0;
    for (const m of this.saved.moves) {
      if (existsSync(m.to) && !existsSync(m.from)) {
        try { renameSync(m.to, m.from); back++; } catch { /* on continue */ }
      }
    }
    this.saved.moves = [];
    this.save();
    return back;
  }

  get folder() {
    return this.dir;
  }
}
