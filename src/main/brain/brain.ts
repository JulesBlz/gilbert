// Le cerveau de Gilbert : un modèle de langage qui tourne entièrement sur la machine,
// via llama.cpp (bibliothèque node-llama-cpp, GPU Metal sur Mac, CUDA/Vulkan ou CPU sur Windows).

import { EventEmitter } from 'node:events';
import type { BrainStatus, Memory } from '../../shared/types';
import { MODELS, download, isDownloaded, isPartial, modelPath, pickModel, type ModelInfo } from './models';
import { systemPrompt, type Persona } from './persona';

// au-delà de cette pause, on repart d'une conversation neuve (et d'une heure à jour)
const FRESH_AFTER_MS = 30 * 60_000;

import type { Llama, LlamaChatSession as Session, LlamaContextSequence as Sequence, LlamaModel } from 'node-llama-cpp';

// node-llama-cpp est un module ESM : on le charge à la demande depuis notre bundle CommonJS
type NodeLlamaCpp = typeof import('node-llama-cpp');
const loadLib = () => import('node-llama-cpp') as Promise<NodeLlamaCpp>;

export class Brain extends EventEmitter {
  info: ModelInfo;
  status: BrainStatus;
  /** Un autre cerveau en cours de téléchargement pendant que celui-ci continue de tourner */
  pulling: { id: string; progress: number } | null = null;
  private persona: Persona;
  private memory: Memory;
  private context = '';
  private lib: NodeLlamaCpp | null = null;
  private llama: Llama | null = null;
  private model: LlamaModel | null = null;
  private sequence: Sequence | null = null;
  /** Seconde « piste » du même modèle, pour les extractions (mémoire) sans gêner la discussion */
  private extractSequence: Sequence | null = null;
  private extractQueue: Promise<unknown> = Promise.resolve();
  private grammars = new Map<string, Promise<{ parse(json: string): unknown }>>();
  private session: Session | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private aborts = new Map<number, AbortController>();
  private downloading: AbortController | null = null;
  private lastAsk = 0;

  constructor(persona: Persona, memory: Memory, modelId = '') {
    super();
    this.info = pickModel(modelId);
    this.persona = persona;
    this.memory = memory;
    this.status = isDownloaded(this.info)
      ? { state: 'loading', model: this.info.label }
      : { state: 'missing', model: this.info.label, size: this.info.size };
  }

  private setStatus(s: BrainStatus) {
    this.status = s;
    this.emit('status', s);
  }

  /** Charge le modèle s'il est déjà sur le disque, ou reprend un téléchargement interrompu */
  async start() {
    if (isDownloaded(this.info)) await this.load();
    else if (isPartial(this.info)) await this.download();
  }

  /**
   * Passe à un autre cerveau. Pendant qu'il se télécharge, l'actuel continue de tourner ; une fois
   * prêt, on bascule (un court instant de « réveil »). Sans cerveau du tout, c'est un premier téléchargement.
   */
  async use(id: string) {
    const m = MODELS.find((x) => x.id === id);
    if (!m || m.id === this.info.id || this.pulling) return;
    const none = this.status.state === 'missing' || this.status.state === 'error';
    if (none && !this.downloading) {
      this.info = m;
      this.status = isDownloaded(m) ? { state: 'loading', model: m.label } : { state: 'missing', model: m.label, size: m.size };
      this.emit('status', this.status);
      await this.start();
      if (this.status.state === 'missing') await this.download();
      return;
    }
    if (this.downloading || this.status.state === 'loading') return;
    if (!isDownloaded(m)) {
      this.pulling = { id: m.id, progress: 0 };
      this.emit('pull');
      try {
        await download(m, (progress) => {
          if (this.pulling) this.pulling.progress = progress;
          this.emit('pull');
        });
      } catch {
        this.pulling = null;
        this.emit('pull');
        return;
      }
      this.pulling = null;
    }
    // la bascule attend la fin de ce que le cerveau actuel est en train de faire
    this.queue = this.queue.then(async () => {
      this.session?.dispose({ disposeSequence: false });
      this.session = null;
      await this.model?.dispose().catch(() => {});
      this.model = null;
      this.sequence = this.extractSequence = null;
      this.info = m;
      await this.load();
    });
    await this.queue;
    this.emit('pull');
  }

  async download() {
    if (this.downloading || this.status.state === 'ready' || this.status.state === 'loading') return;
    this.downloading = new AbortController();
    const { label, size } = this.info;
    try {
      this.setStatus({ state: 'downloading', model: label, size, progress: 0 });
      await download(this.info, (progress) => {
        this.setStatus({ state: 'downloading', model: label, size, progress });
      }, this.downloading.signal);
      await this.load();
    } catch (err) {
      this.setStatus({ state: 'error', model: label, message: (err as Error).message });
    } finally {
      this.downloading = null;
    }
  }

  private async load() {
    this.setStatus({ state: 'loading', model: this.info.label });
    try {
      this.lib ??= await loadLib();
      this.llama = await this.lib.getLlama();
      this.model = await this.llama.loadModel({ modelPath: modelPath(this.info) });
      const context = await this.model.createContext({ contextSize: 4096, sequences: 2 });
      this.sequence = context.getSequence();
      this.extractSequence = context.getSequence();
      this.newSession();
      this.setStatus({ state: 'ready', model: this.info.label });
    } catch (err) {
      this.setStatus({ state: 'error', model: this.info.label, message: (err as Error).message });
    }
  }

  /** Nouvelle conversation (personnalité changée, ou remise à zéro) */
  private newSession() {
    if (!this.lib || !this.model || !this.sequence) return;
    this.session?.dispose({ disposeSequence: false });
    this.sequence.clearHistory();
    // Gemma 4 « réfléchit » par défaut avant de répondre : lent, et la réflexion peut fuiter dans la
    // bulle. On la coupe au niveau du format de conversation.
    this.session = new this.lib.LlamaChatSession({
      contextSequence: this.sequence,
      chatWrapper: this.chatWrapper(),
      systemPrompt: systemPrompt(this.persona, this.memory, this.context),
    });
  }

  private chatWrapper() {
    const lib = this.lib!;
    const auto = lib.resolveChatWrapper(this.model!);
    return auto instanceof lib.Gemma4ChatWrapper ? new lib.Gemma4ChatWrapper({ reasoning: false }) : auto ?? 'auto';
  }

  /** La mémoire a changé : on met à jour les instructions sans perdre la conversation en cours */
  setMemory(m: Memory) {
    this.memory = m;
    this.refreshSystem();
  }

  /** Agenda, échéances, mails importants : même principe */
  setContext(text: string) {
    if (text === this.context) return;
    this.context = text;
    this.refreshSystem();
  }

  private refreshSystem() {
    this.queue = this.queue.then(() => {
      if (!this.session) return;
      const history = this.session.getChatHistory();
      if (history[0]?.type !== 'system') return;
      history[0] = { type: 'system', text: systemPrompt(this.persona, this.memory, this.context) };
      this.session.setChatHistory(history);
    });
  }

  /**
   * Fait extraire au modèle une information structurée (JSON conforme à `schema`), sur la piste
   * dédiée. `task` contient la consigne, un exemple et le texte : sous contrainte JSON, le modèle
   * a tendance à rendre une liste vide si la consigne n'est que dans les instructions système.
   * Renvoie null si le cerveau n'est pas prêt ou si la sortie est inutilisable.
   */
  extract<T>(task: string, schema: object): Promise<T | null> {
    const run = async (): Promise<T | null> => {
      if (!this.lib || !this.llama || !this.extractSequence) return null;
      const key = JSON.stringify(schema);
      if (!this.grammars.has(key)) {
        this.grammars.set(key, this.llama.createGrammarForJsonSchema(schema as never) as Promise<{ parse(json: string): unknown }>);
      }
      const grammar = await this.grammars.get(key)!;
      this.extractSequence.clearHistory();
      const session = new this.lib.LlamaChatSession({
        contextSequence: this.extractSequence,
        chatWrapper: this.chatWrapper(),
        systemPrompt: this.persona.lang !== 'fr'
          ? 'You extract information from a text and answer in JSON only.'
          : "Tu extrais des informations d'un texte et tu réponds uniquement en JSON.",
      });
      try {
        const out = await session.prompt(task, { grammar: grammar as never, temperature: 0, maxTokens: 400 });
        return grammar.parse(out) as T;
      } catch {
        return null;
      } finally {
        session.dispose({ disposeSequence: false });
      }
    };
    const result = this.extractQueue.then(run);
    this.extractQueue = result.catch(() => {});
    return result;
  }

  /**
   * Fait écrire au modèle un texte plus long qu'une bulle (le brief du jour), avec la personnalité
   * de Gilbert, sur la piste des extractions : la discussion en cours n'est pas touchée.
   * Renvoie null si le cerveau n'est pas prêt.
   */
  compose(task: string, maxTokens = 300): Promise<string | null> {
    const run = async (): Promise<string | null> => {
      if (!this.lib || !this.extractSequence) return null;
      this.extractSequence.clearHistory();
      const session = new this.lib.LlamaChatSession({
        contextSequence: this.extractSequence,
        chatWrapper: this.chatWrapper(),
        systemPrompt: systemPrompt(this.persona, this.memory),
      });
      try {
        return await session.prompt(task, { maxTokens, temperature: 0.8, topP: 0.95, budgets: { thoughtTokens: 0 } });
      } catch {
        return null;
      } finally {
        session.dispose({ disposeSequence: false });
      }
    };
    const result = this.extractQueue.then(run);
    this.extractQueue = result.catch(() => {});
    return result;
  }

  setPersona(p: Persona) {
    const changed = p.lang !== this.persona.lang || p.humor !== this.persona.humor;
    this.persona = p;
    // on attend la fin d'une éventuelle réponse en cours avant de changer de conversation
    if (changed) this.queue = this.queue.then(() => this.newSession());
  }

  /**
   * Pose une question. Les morceaux de réponse arrivent au fil de l'eau dans `onChunk`.
   * Les questions sont traitées une par une.
   */
  /** Les échanges d'une discussion longue ont remplacé la conversation de la bulle */
  private longChat = false;

  /**
   * Pose une question. `history` : les échanges d'une discussion longue (l'onglet Discussion), qui
   * remplacent le fil de la bulle ; `long` : une réponse plus étoffée que les quelques mots d'une bulle.
   */
  ask(id: number, text: string, onChunk: (t: string) => void, opts: { history?: { role: 'user' | 'gilbert'; text: string }[]; long?: boolean } = {}): Promise<string> {
    const abort = new AbortController();
    this.aborts.set(id, abort);
    const run = async () => {
      if (Date.now() - this.lastAsk > FRESH_AFTER_MS || (this.longChat && !opts.history)) this.newSession();
      this.lastAsk = Date.now();
      if (!this.session) throw new Error("le cerveau n'est pas prêt");
      if (opts.history) {
        this.session.setChatHistory([
          { type: 'system', text: systemPrompt(this.persona, this.memory, this.context) },
          ...opts.history.map((m) => (m.role === 'user' ? { type: 'user' as const, text: m.text } : { type: 'model' as const, response: [m.text] })),
        ]);
      }
      this.longChat = Boolean(opts.history);
      try {
        return await this.session.prompt(text, {
          maxTokens: opts.long ? 600 : 180,
          temperature: 0.8,
          topP: 0.95,
          signal: abort.signal,
          stopOnAbortSignal: true,
          // pas de « réflexion » à voix basse : on veut une réponse directe et rapide
          budgets: { thoughtTokens: 0 },
          onResponseChunk: (chunk) => {
            if (chunk.type === 'segment' && chunk.segmentType === 'thought') return;
            if (chunk.text) onChunk(chunk.text);
          },
        });
      } finally {
        this.aborts.delete(id);
      }
    };
    const result = this.queue.then(run);
    this.queue = result.catch(() => {});
    return result;
  }

  cancel(id: number) {
    this.aborts.get(id)?.abort();
  }

  /** Libère le modèle (à la fermeture : sinon llama.cpp plante en quittant) */
  async dispose() {
    for (const a of this.aborts.values()) a.abort();
    await this.llama?.dispose().catch(() => {});
    this.llama = null;
  }
}
