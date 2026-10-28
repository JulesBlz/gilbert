// Teste les notes vocales : des phrases dites par la synthèse vocale du Mac (say), transcrites
// par Whisper sur la machine. Télécharge Whisper (~250 Mo) la première fois.
//   npm run test:voice

import { app } from 'electron';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, symlinkSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { transcribe } from '../src/main/voice';
import type { Lang } from '../src/shared/types';

const real = path.join(app.getPath('appData'), 'gilbert');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gilbert-test-'));
mkdirSync(path.join(real, 'models'), { recursive: true });
symlinkSync(path.join(real, 'models'), path.join(tmp, 'models'));
app.setPath('userData', tmp);
app.dock?.hide();

app.whenReady().then(run).catch((err) => { console.error('échec :', err); app.quit(); });

/** WAV 16 bits 16 kHz mono → Float32 */
function wav(file: string) {
  const b = readFileSync(file);
  let i = 12;
  while (b.toString('ascii', i, i + 4) !== 'data') i += 8 + b.readUInt32LE(i + 4);
  const data = b.subarray(i + 8, i + 8 + b.readUInt32LE(i + 4));
  const out = new Float32Array(data.length / 2);
  for (let k = 0; k < out.length; k++) out[k] = data.readInt16LE(k * 2) / 32768;
  return out;
}

async function run() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'gilbert-voice-'));
  const samples: [Lang, string, string][] = [
    ['fr', 'Thomas', "Rappelle-moi d'appeler Paul demain à dix heures."],
    ['fr', 'Amélie', 'Gilbert, vingt-cinq minutes, on bosse.'],
    ['en', 'Samantha', 'What is on my calendar tomorrow morning?'],
    ['vi', 'Linh', 'Nhắc tớ gọi cho mẹ lúc tám giờ tối nay.'],
  ];
  let last = -1;
  for (const [lang, voice, text] of samples) {
    const aiff = path.join(dir, 'a.aiff'), out = path.join(dir, 'a.wav');
    try {
      execFileSync('say', ['-v', voice, text, '-o', aiff]);
    } catch {
      console.log(`(voix ${voice} absente, phrase ignorée)`);
      continue;
    }
    execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', aiff, out]);
    const t0 = Date.now();
    const heard = await transcribe(wav(out), lang, (p) => {
      const pct = Math.floor(p * 10) * 10;
      if (pct !== last) { last = pct; console.log(`  téléchargement de Whisper : ${pct} %`); }
    });
    console.log(`[${lang}] dit : « ${text} »\n     entendu : « ${heard} » (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  app.quit();
}
