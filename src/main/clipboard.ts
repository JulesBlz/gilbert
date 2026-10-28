// Le presse-papiers malin : tu copies un texte, Gilbert dresse l'oreille. Une petite bulle discrète
// (il ne bouge pas, ne parle pas) dit ce qu'il a vu (« un texte en anglais », « un message
// d'erreur ») et propose ce qui a du sens : traduire, résumer, corriger, reformuler, raccourcir,
// rendre plus pro, expliquer. Il réfléchit (petits points), puis écrit le résultat dans une bulle
// qui reste là tant qu'on n'a pas cliqué un bouton ou attrapé Gilbert. Il ne touche jamais à ton
// presse-papiers tout seul : « Copier » le fait si tu veux. Tout se fait sur la machine. Il ne
// regarde jamais les mots de passe, adresses web et autres textes d'un seul mot, ni ce qu'il copie
// lui-même ; ignoré trois fois de suite, il se fait oublier un quart d'heure.

import { clipboard } from 'electron';
import { randomUUID } from 'node:crypto';
import type { Brain } from './brain/brain';
import { SPEAK, type Command, type Lang } from '../shared/types';

type Help = 'translate' | 'summary' | 'explain' | 'explainCode' | 'fix' | 'rephrase' | 'shorter' | 'formal';
/** Ce qu'il a reconnu dans le texte copié */
type Kind = 'error' | 'code' | 'foreign' | 'own';

const POLL_MS = 1200;
const GAP_MS = 25_000;
const SNOOZE_MS = 15 * 60_000;

const WORDS: Record<string, RegExp> = {
  fr: /\b(le|la|les|des|est|une|pas|que|pour|dans|avec|sur|qui|mais|vous|nous|je|tu|il|elle|ce|cette|du|au)\b/gi,
  en: /\b(the|and|is|are|to|of|in|that|for|with|you|this|not|be|have|it|was|we|they|on|at)\b/gi,
  vi: /\b(và|của|không|là|một|những|các|được|cho|với|này|có|tôi|bạn|người)\b|[ăâđêôơư]/gi,
  de: /\b(der|die|das|und|ist|nicht|ich|sie|mit|für|auf|ein|eine|zu|den|dem)\b/gi,
  es: /\b(el|los|las|que|y|es|por|para|con|una|del|como|pero|muy|está)\b/gi,
  it: /\b(il|che|di|è|per|non|una|sono|della|con|gli|anche|questo)\b/gi,
};

const LANG_NAME: Record<string, Record<Lang, string>> = {
  fr: { fr: 'en français', en: 'in French', vi: 'tiếng Pháp' },
  en: { fr: 'en anglais', en: 'in English', vi: 'tiếng Anh' },
  vi: { fr: 'en vietnamien', en: 'in Vietnamese', vi: 'tiếng Việt' },
  de: { fr: 'en allemand', en: 'in German', vi: 'tiếng Đức' },
  es: { fr: 'en espagnol', en: 'in Spanish', vi: 'tiếng Tây Ban Nha' },
  it: { fr: 'en italien', en: 'in Italian', vi: 'tiếng Ý' },
};

/** La langue la plus probable d'un texte (null si on ne sait pas) */
export function guessLang(text: string) {
  const scores = Object.entries(WORDS).map(([l, re]) => [l, (text.match(re) ?? []).length] as const).sort((a, b) => b[1] - a[1]);
  const [best, n] = scores[0];
  return n >= 2 && n > (scores[1]?.[1] ?? 0) * 1.3 ? best : null;
}

const ERROR = /(error|exception|traceback|failed|failure|erreur|échec|undefined is not|cannot find|cannot read|not found|TypeError|SyntaxError|ReferenceError|ENOENT|EACCES|segmentation fault|panic|fatal|stack trace|errno|exit code)/i;
/** Du code : accolades, points-virgules en fin de ligne, mots-clés, flèches… sur plusieurs lignes */
const CODE = /(^|\n)\s*(import |export |const |let |var |function |def |class |return |if \(|for \(|#include|public |SELECT |<\/?[a-z]+[ >])|[{};]\s*(\n|$)|=>|\)\s*\{/i;

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

/** Ce qu'il a reconnu, et les aides qui ont du sens (la première est la plus probable), ou null */
export function helpsFor(text: string, lang: Lang): { kind: Kind; from: string | null; helps: Help[] } | null {
  const t = text.trim();
  // un seul « mot » (mot de passe, lien, numéro…) : on n'y touche pas
  if (t.length < 25 || t.length > 6000 || !/\s/.test(t) || /^https?:\/\/\S+$/.test(t)) return null;
  const lines = t.split('\n').length;
  if (ERROR.test(t) && (lines <= 12 || /traceback|stack|at \S+ \(/i.test(t))) return { kind: 'error', from: null, helps: ['explain'] };
  if (CODE.test(t) && lines >= 2) return { kind: 'code', from: null, helps: ['explainCode'] };
  const from = guessLang(t);
  const long = words(t) > 120;
  // dans une autre langue : à traduire, ou bien c'est toi qui l'as écrit (un mail en anglais) et il faut le relire
  if (from && from !== lang) return { kind: 'foreign', from, helps: long ? ['translate', 'summary', 'fix'] : ['translate', 'fix', 'rephrase'] };
  if (from !== lang) return null;
  if (long) return { kind: 'own', from, helps: ['summary', 'fix', 'shorter'] };
  // une phrase ou deux de ta main : ce qu'on fait d'un mail ou d'un message
  return /[.!?,]/.test(t) ? { kind: 'own', from, helps: ['fix', 'rephrase', 'shorter', 'formal'] } : null;
}

/** Les aides qui réécrivent le texte (le reste l'explique ou le résume) */
const REWRITES: Help[] = ['translate', 'fix', 'rephrase', 'shorter', 'formal'];
/** Ce qu'une bulle peut montrer ; au-delà, « Copier » donne le texte entier */
const SHOWN = 600;
const PASTE = process.platform === 'darwin' ? 'Cmd+V' : 'Ctrl+V';
const SAMPLE = 'Hi Jules, could you send me the final version of the slides before Thursday noon? We present to the board on Friday morning. Thanks!';

type Pending =
  | { step: 'ask'; text: string; demo: boolean }
  | { step: 'done'; result: string };

export class ClipboardHelper {
  private last = '';
  private written = '';
  private lastOffer = 0;
  private ignored = 0;
  private snoozeUntil = 0;
  private timer: NodeJS.Timeout | null = null;
  private pending = new Map<string, Pending>();

  constructor(private deps: {
    brain: Brain;
    send: (cmd: Command) => void;
    lang: () => Lang;
    /** Il peut proposer quelque chose maintenant (réglage, Chut, session, devant l'écran…) */
    allowed: () => boolean;
    /** Une aide a vraiment servi (pour la récompense du guide) */
    used?: () => void;
  }) {}

  async start() {
    this.last = await clipboard.readText();
    this.timer = setInterval(() => this.poll().catch(() => {}), POLL_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private t(fr: string, en: string, vi: string) {
    return { fr, en, vi }[this.deps.lang()];
  }

  private label(h: Help | 'no' | 'copy' | 'ok') {
    const l: Record<typeof h, [string, string, string]> = {
      translate: ['Traduire', 'Translate', 'Dịch'],
      summary: ['Résumer', 'Summarise', 'Tóm tắt'],
      explain: ['Expliquer', 'Explain', 'Giải thích'],
      explainCode: ['Expliquer', 'Explain', 'Giải thích'],
      fix: ['Corriger', 'Fix', 'Sửa lỗi'],
      rephrase: ['Reformuler', 'Rephrase', 'Viết lại'],
      shorter: ['Plus court', 'Shorter', 'Ngắn hơn'],
      formal: ['Plus pro', 'More formal', 'Trang trọng hơn'],
      no: ['Non merci', 'No thanks', 'Thôi'],
      copy: ['Copier', 'Copy', 'Sao chép'],
      ok: ['Merci', 'Thanks', 'Cảm ơn'],
    };
    return this.t(...l[h]);
  }

  /** Ce qu'il a vu, en clair */
  private describe(kind: Kind, from: string | null, text: string) {
    const lang = this.deps.lang(), n = words(text);
    switch (kind) {
      case 'error': return this.t('Tu as copié un message d’erreur. Je t’explique ce qui cloche ?', 'You copied an error message. Want me to explain what’s wrong?', 'Cậu vừa chép một thông báo lỗi. Tớ giải thích nhé?');
      case 'code': return this.t('Tu as copié du code. Je te l’explique ?', 'You copied some code. Want an explanation?', 'Cậu vừa chép một đoạn mã. Tớ giải thích nhé?');
      case 'foreign': {
        const name = LANG_NAME[from!]?.[lang] ?? '';
        return this.t(`Tu as copié un texte ${name} (${n} mots). J’en fais quoi ?`, `You copied a text ${name} (${n} words). What should I do with it?`, `Cậu vừa chép một đoạn ${name} (${n} từ). Tớ làm gì với nó?`);
      }
      case 'own': return this.t(`Tu as copié un texte (${n} mots). Je le retravaille ?`, `You copied a text (${n} words). Want me to work on it?`, `Cậu vừa chép một đoạn (${n} từ). Tớ sửa giúp nhé?`);
    }
  }

  private offer(text: string, demo: boolean) {
    const found = helpsFor(text, this.deps.lang());
    if (!found) return false;
    const id = randomUUID();
    this.pending.set(id, { step: 'ask', text, demo });
    const intro = demo ? this.t(`Exemple : imagine que tu viens de copier « ${text} ».`, `Example: imagine you just copied "${text}".`, `Ví dụ: giả sử cậu vừa chép « ${text} ».`) + ' ' : '';
    this.deps.send({
      type: 'offer', id, text: intro + this.describe(found.kind, found.from, text), ttl: demo ? 40_000 : 15_000,
      actions: [...found.helps.map((h) => ({ label: this.label(h), value: h })), { label: this.label('no'), value: 'no' }],
    });
    return true;
  }

  /** Le guide : montre ce qu'il proposerait pour un texte en anglais (sans toucher au presse-papiers) */
  demo() {
    this.offer(SAMPLE, true);
  }

  private async poll() {
    const text = await clipboard.readText();
    if (text === this.last) return;
    this.last = text;
    // ce qu'il vient de copier lui-même (une traduction, un brouillon) ne compte pas
    if (text === this.written) return;
    const now = Date.now();
    if (!this.deps.allowed() || this.deps.brain.status.state !== 'ready' || now < this.snoozeUntil || now - this.lastOffer < GAP_MS) return;
    if (!helpsFor(text, this.deps.lang())) return;
    // la proposition précédente n'a pas été prise
    if ([...this.pending.values()].some((p) => p.step === 'ask')) this.ignore();
    if (now < this.snoozeUntil) return;
    this.pending.clear();
    if (this.offer(text, false)) this.lastOffer = now;
  }

  private ignore() {
    this.pending.clear();
    if (++this.ignored >= 3) {
      this.ignored = 0;
      this.snoozeUntil = Date.now() + SNOOZE_MS;
    }
  }

  /** Réponse à une bulle (renvoie false si ce n'était pas une des siennes) */
  answer(id: string, value: string) {
    const p = this.pending.get(id);
    if (!p) return false;
    this.pending.clear();
    if (value === 'no') {
      this.ignore();
      return true;
    }
    this.ignored = 0;
    if (p.step === 'ask') {
      this.run(value as Help, p.text).catch(() => {});
    } else if (value === 'copy') {
      // c'est toi qui le demandes : là seulement, il remplit le presse-papiers
      this.written = this.last = p.result;
      clipboard.writeText(p.result);
      this.deps.send({ type: 'offer', id: randomUUID(), text: this.t(`Copié. Colle-le avec ${PASTE}.`, `Copied. Paste it with ${PASTE}.`, `Đã chép. Dán bằng ${PASTE}.`), actions: [], ttl: 3500 });
    }
    return true;
  }

  private async run(help: Help, text: string) {
    const lang = this.deps.lang();
    this.deps.used?.();
    // il réfléchit sans bouger ; le résultat arrivera dans une autre bulle
    this.deps.send({ type: 'offer', id: randomUUID(), text: '', thinking: true, actions: [], ttl: 90_000 });
    const keep = 'sans changer la langue du texte ni son sens. Écris seulement le nouveau texte.';
    const tasks: Record<Help, string> = {
      translate: `Traduis ce texte ${{ fr: 'en français', en: 'in English', vi: 'in Vietnamese' }[lang]}, fidèlement, en gardant la mise en forme. Écris seulement la traduction.`,
      fix: 'Corrige les fautes d’orthographe, de grammaire et de frappe de ce texte, sans changer son style ni son sens. Écris seulement le texte corrigé.',
      rephrase: `Reformule ce texte pour qu'il soit plus clair et plus fluide, même ton, ${keep}`,
      shorter: `Raccourcis ce texte de moitié environ en gardant l'essentiel, même ton, ${keep}`,
      formal: `Réécris ce texte sur un ton plus professionnel et poli (comme pour un mail de travail), ${keep}`,
      summary: `Résume ce texte en 2 ou 3 phrases courtes, ${SPEAK[lang]}. Écris seulement le résumé.`,
      explain: `Explique cette erreur en 2 phrases simples, ${SPEAK[lang]} : ce qu’elle veut dire, et comment la corriger. Écris seulement l’explication.`,
      explainCode: `Explique ce que fait ce code en 2 ou 3 phrases simples, ${SPEAK[lang]}. Écris seulement l’explication.`,
    };
    const out = (await this.deps.brain.compose(`${tasks[help]}\n\nTexte :\n"""\n${text.slice(0, 4000)}\n"""`, REWRITES.includes(help) ? 900 : 200))?.trim();
    const id = randomUUID();
    if (!out) {
      this.deps.send({ type: 'offer', id, text: this.t('Je n’y arrive pas, désolé.', 'I couldn’t do it, sorry.', 'Tớ chịu, xin lỗi nhé.'), actions: [], ttl: 4000 });
      return;
    }
    this.pending.set(id, { step: 'done', result: out });
    // un texte trop long est coupé à la fin d'un mot ; « Copier » donne tout
    const shown = out.length <= SHOWN ? out : `${out.slice(0, SHOWN).replace(/\s+\S*$/, '')}…`;
    this.deps.send({
      type: 'offer', id, text: shown, long: shown.length > 140, ttl: 0,
      actions: [{ label: this.label('copy'), value: 'copy' }, { label: this.label('ok'), value: 'ok' }],
    });
  }
}
