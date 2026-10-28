// Les notes vocales : tu parles, Whisper (le modèle de reconnaissance vocale d'OpenAI, version
// « small », multilingue) transcrit, sur la machine, grâce à transformers.js. Le modèle (~250 Mo)
// est téléchargé une fois, au premier usage, dans le dossier des modèles de Gilbert.

import { app } from 'electron';
import path from 'node:path';
import type { Lang } from '../shared/types';

const MODEL = 'onnx-community/whisper-small';
const LANGUAGE: Record<Lang, string> = { fr: 'french', en: 'english', vi: 'vietnamese' };

type Transcriber = (audio: Float32Array, opts: object) => Promise<{ text: string } | { text: string }[]>;
let loading: Promise<Transcriber> | null = null;

/** Charge Whisper (et le télécharge la première fois) ; `onProgress` reçoit 0 à 1 pendant le téléchargement */
function load(onProgress?: (p: number) => void) {
  loading ??= (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.cacheDir = path.join(app.getPath('userData'), 'models', 'whisper');
    env.allowLocalModels = false;
    const files = new Map<string, { loaded: number; total: number }>();
    let shown = 0;
    const asr = await pipeline('automatic-speech-recognition', MODEL, {
      dtype: 'q8',
      device: 'cpu',
      // la part téléchargée de tous les fichiers du modèle, sans jamais reculer
      progress_callback: (e: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (e.status !== 'progress' || !e.file || !e.total) return;
        files.set(e.file, { loaded: e.loaded ?? 0, total: e.total });
        const all = [...files.values()];
        const p = all.reduce((a, f) => a + f.loaded, 0) / all.reduce((a, f) => a + f.total, 0);
        if (p > shown) { shown = p; onProgress?.(p); }
      },
    });
    return asr as unknown as Transcriber;
  })().catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

export const voiceReady = () => loading !== null;

/** Transcrit un son 16 kHz mono ; chaîne vide si rien d'intelligible */
export async function transcribe(pcm: Float32Array, lang: Lang, onProgress?: (p: number) => void) {
  if (pcm.length < 16000 * 0.4) return '';
  const asr = await load(onProgress);
  const out = await asr(pcm, { language: LANGUAGE[lang], task: 'transcribe', chunk_length_s: 30 });
  const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text).trim();
  // Whisper « entend » parfois des formules toutes faites dans le silence
  if (/^(\[.*\]|\(.*\)|sous-titr|merci d'avoir regardé|thanks for watching|\.+)$/i.test(text)) return '';
  return text;
}
