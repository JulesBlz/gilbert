// Sons de Gilbert, tous synthétisés (aucun fichier audio).
// La voix joue une syllabe courte par lettre affichée, façon « charabia animal ».

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.9;
    // un passe-bas adoucit les ondes carrées
    const soft = ctx.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 2400;
    master.connect(soft).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

function tone(
  freq: number, start: number, dur: number,
  { type = 'triangle' as OscillatorType, gain = 0.08, glide = 1 } = {},
) {
  const a = audio();
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (glide !== 1) osc.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master!);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const VOWELS = 'aeiouyàâäéèêëîïôöùûü';
const VOICE_BASE = 300;

/** Une syllabe de la voix de Gilbert pour le caractère `ch` */
export function voice(ch: string) {
  if (!enabled || !/[\p{L}\p{N}]/u.test(ch)) return;
  const c = ch.toLowerCase();
  const isVowel = VOWELS.includes(c);
  // hauteur stable par lettre pour que les mots aient une « mélodie »
  const step = (c.codePointAt(0)! * 7) % 6;
  const freq = VOICE_BASE * (isVowel ? 1.22 : 1) * (1 + step * 0.045);
  tone(freq, 0, 0.05, { type: 'square', gain: 0.035, glide: 0.92 });
}

export const sfx = {
  alert() {
    if (!enabled) return;
    tone(659, 0, 0.09, { gain: 0.09 });
    tone(988, 0.1, 0.14, { gain: 0.09 });
  },
  pop() {
    if (!enabled) return;
    tone(520, 0, 0.07, { type: 'sine', gain: 0.1, glide: 1.8 });
  },
  /** La benne qui s'ébranle : un grondement métallique, puis des cliquetis */
  rattle() {
    if (!enabled) return;
    tone(90, 0, 0.3, { type: 'sawtooth', gain: 0.05, glide: 0.8 });
    for (let i = 0; i < 5; i++) tone(520 + (i % 2) * 170, 0.04 + i * 0.06, 0.04, { type: 'square', gain: 0.03, glide: 0.7 });
  },
  thud() {
    if (!enabled) return;
    tone(150, 0, 0.14, { type: 'sine', gain: 0.18, glide: 0.45 });
  },
  hop() {
    if (!enabled) return;
    tone(440, 0, 0.06, { type: 'square', gain: 0.03, glide: 1.5 });
    tone(660, 0.07, 0.06, { type: 'square', gain: 0.03, glide: 1.5 });
  },
  jump() {
    if (!enabled) return;
    tone(330, 0, 0.22, { type: 'square', gain: 0.035, glide: 2.6 });
  },
  squeak() {
    if (!enabled) return;
    tone(900, 0, 0.08, { type: 'triangle', gain: 0.06, glide: 1.4 });
  },
  whistle() {
    if (!enabled) return;
    tone(1200, 0, 0.35, { type: 'sine', gain: 0.06, glide: 0.4 });
  },
};
