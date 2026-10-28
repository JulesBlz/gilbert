// Modèles de langage locaux : choix selon la RAM, emplacement sur disque, téléchargement.

import { app } from 'electron';
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';

export interface ModelInfo {
  id: string;
  label: string;
  file: string;
  url: string;
  /** Taille approximative en octets (pour l'affichage avant téléchargement) */
  size: number;
  /** RAM minimale de la machine, en Go */
  minRamGB: number;
}

const HF = 'https://huggingface.co';

// Gemma 4 (licence Apache 2.0), quantifié en Q4_K_M par Unsloth. Tous savent aussi lire des images.
export const MODELS: ModelInfo[] = [
  {
    id: 'gemma-4-12b', label: 'Gemma 4 12B', minRamGB: 20, size: 7.12e9,
    file: 'gemma-4-12b-it-Q4_K_M.gguf',
    url: `${HF}/unsloth/gemma-4-12b-it-GGUF/resolve/main/gemma-4-12b-it-Q4_K_M.gguf`,
  },
  {
    id: 'gemma-4-e4b', label: 'Gemma 4 E4B', minRamGB: 12, size: 4.98e9,
    file: 'gemma-4-E4B-it-Q4_K_M.gguf',
    url: `${HF}/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_K_M.gguf`,
  },
  {
    id: 'gemma-4-e2b', label: 'Gemma 4 E2B', minRamGB: 0, size: 3.11e9,
    file: 'gemma-4-E2B-it-Q4_K_M.gguf',
    url: `${HF}/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf`,
  },
];

/** Le plus gros modèle que la machine peut porter confortablement */
export function pickModel(): ModelInfo {
  const ramGB = os.totalmem() / 2 ** 30;
  return MODELS.find((m) => ramGB >= m.minRamGB) ?? MODELS[MODELS.length - 1];
}

export const modelsDir = () => path.join(app.getPath('userData'), 'models');
export const modelPath = (m: ModelInfo) => path.join(modelsDir(), m.file);

/** Un modèle n'existe sous son nom final qu'une fois entièrement téléchargé */
export const isDownloaded = (m: ModelInfo) => existsSync(modelPath(m));

/** Un téléchargement a été commencé puis interrompu */
export const isPartial = (m: ModelInfo) => existsSync(`${modelPath(m)}.part`);

/**
 * Télécharge le modèle dans un fichier `.part`, en reprenant là où on s'était arrêté,
 * puis le renomme. `onProgress` reçoit une valeur entre 0 et 1.
 */
export async function download(m: ModelInfo, onProgress: (p: number) => void, signal?: AbortSignal) {
  mkdirSync(modelsDir(), { recursive: true });
  const final = modelPath(m);
  const part = `${final}.part`;
  let start = existsSync(part) ? statSync(part).size : 0;

  const res = await fetch(m.url, { headers: start ? { Range: `bytes=${start}-` } : {}, signal });
  if (!res.ok || !res.body) throw new Error(`téléchargement refusé (HTTP ${res.status})`);
  // le serveur a ignoré la reprise : on repart de zéro
  if (res.status === 200) start = 0;

  const total = start + Number(res.headers.get('content-length') ?? m.size - start);
  const out = createWriteStream(part, { flags: start ? 'a' : 'w' });
  let received = start;
  let lastReport = 0;
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      if (!out.write(chunk)) await once(out, 'drain');
      received += chunk.length;
      const now = Date.now();
      if (now - lastReport > 500) {
        lastReport = now;
        onProgress(received / total);
      }
    }
  } finally {
    await new Promise<void>((done) => out.end(done));
  }
  if (received < total) throw new Error('téléchargement interrompu');
  renameSync(part, final);
  onProgress(1);
}
