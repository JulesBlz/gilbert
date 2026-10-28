// Le micro des notes vocales : enregistre en 16 kHz mono (ce qu'attend Whisper), et s'arrête tout
// seul après un silence d'une seconde et demie une fois que tu as parlé, ou au bout de 20 s.
// Pendant l'enregistrement, il passe régulièrement le son déjà entendu (pour l'écrire au fil de la voix).

const RATE = 16000;
const SILENCE = { level: 0.012, speech: 0.03, after: 1.6 };
const MAX_SECONDS = 20;
/** Tous les combien on transmet le son déjà entendu */
const PARTIAL_EVERY = 1.2;

export class Mic {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private chunks: Float32Array[] = [];
  private done: ((pcm: Float32Array) => void) | null = null;
  recording = false;

  /** Démarre ; la promesse rend le son quand l'enregistrement s'arrête (seul ou par stop()) */
  async record(onPartial?: (sofar: Float32Array) => void): Promise<Float32Array> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    this.ctx = new AudioContext({ sampleRate: RATE });
    const source = this.ctx.createMediaStreamSource(this.stream);
    // ScriptProcessor : simple, et suffisant pour quelques secondes de voix
    const node = this.ctx.createScriptProcessor(4096, 1, 1);
    this.chunks = [];
    this.recording = true;
    let spoke = false, quiet = 0, total = 0, lastPartial = 0;
    node.onaudioprocess = (e) => {
      if (!this.recording) return;
      const data = new Float32Array(e.inputBuffer.getChannelData(0));
      this.chunks.push(data);
      const rms = Math.sqrt(data.reduce((a, v) => a + v * v, 0) / data.length);
      const seconds = data.length / RATE;
      total += seconds;
      if (rms > SILENCE.speech) spoke = true;
      quiet = rms < SILENCE.level ? quiet + seconds : 0;
      if ((spoke && quiet > SILENCE.after) || total > MAX_SECONDS) return this.stop();
      if (spoke && onPartial && total - lastPartial >= PARTIAL_EVERY) {
        lastPartial = total;
        onPartial(this.joined());
      }
    };
    source.connect(node);
    node.connect(this.ctx.destination);
    return new Promise((resolve) => { this.done = resolve; });
  }

  stop() {
    if (!this.recording) return;
    this.recording = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.done?.(this.joined());
    this.done = null;
  }

  private joined() {
    const pcm = new Float32Array(this.chunks.reduce((a, c) => a + c.length, 0));
    let o = 0;
    for (const c of this.chunks) { pcm.set(c, o); o += c.length; }
    return pcm;
  }
}
