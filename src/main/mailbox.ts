// La mémoire des mails : chaque mail reçu (et ceux du dernier mois au branchement) est rangé dans
// mails.json, sur la machine, avec son résumé. Quand tu poses une question (« qu'est-ce que Paul
// m'a demandé ? »), les mails qui y répondent sont retrouvés par mots-clés (BM25) et donnés au
// cerveau avec la question : il répond à partir d'eux, sans rien inventer.

import { app } from 'electron';
import { EventEmitter } from 'node:events';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Lang } from '../shared/types';

export interface StoredMail {
  uid: number;
  date: number;
  from: string;
  fromAddress: string;
  subject: string;
  /** Début du texte (sans citations ni signature trop longue) */
  text: string;
  /** Résumé d'une ligne par le cerveau (vide pour les mails relus au branchement) */
  summary: string;
  importance: 'important' | 'normal' | 'bruit' | '';
  /** L'expéditeur attend une réponse de toi */
  needsReply: boolean;
  /** Tu as répondu (vu dans tes mails envoyés), ou tu as dit « déjà fait » */
  replied: boolean;
  /** Gilbert t'en a déjà parlé (relance) */
  nagged: boolean;
}

const file = () => path.join(app.getPath('userData'), 'mails.json');
const MAX = 1500;
const KEEP_DAYS = 120;
const TEXT_CHARS = 1200;

// mots trop courants pour aider à retrouver un mail
const STOP = new Set(`le la les un une des du de d l a au aux et ou en dans sur pour par avec sans ce cet cette ces mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs je tu il elle on nous vous ils elles me te se moi toi lui qui que quoi dont ne pas plus est sont ai as avait etait fait faire mail mails email emails message messages
the a an and or of to in on for with without is are was were be have has had i you he she we they me my your his her our their what which who that this these those it its not do does did mail email message
gi la cua va cac nhung mot toi ban cau to minh co khong da se thu email`.split(/\s+/));

export function tokens(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
    .split(/[^\p{L}\p{N}@.]+/u).map((w) => w.replace(/^\.+|\.+$/g, ''))
    .filter((w) => w.length > 1 && !STOP.has(w));
}

export class Mailbox extends EventEmitter {
  mails: StoredMail[];
  private index: { docs: Map<string, number>[]; lengths: number[]; df: Map<string, number>; avg: number } | null = null;

  constructor() {
    super();
    try {
      this.mails = JSON.parse(readFileSync(file(), 'utf8'));
    } catch {
      this.mails = [];
    }
  }

  private commit() {
    const old = Date.now() - KEEP_DAYS * 86_400_000;
    this.mails = this.mails.filter((m) => m.date >= old).sort((a, b) => b.date - a.date).slice(0, MAX);
    mkdirSync(path.dirname(file()), { recursive: true });
    const tmp = `${file()}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.mails));
    renameSync(tmp, file());
    this.index = null;
    this.emit('change');
  }

  has(uid: number) {
    return this.mails.some((m) => m.uid === uid);
  }

  /** Range des mails (les déjà connus sont mis à jour : résumé, importance…) */
  add(list: Omit<StoredMail, 'replied' | 'nagged'>[]) {
    for (const m of list) {
      const text = m.text.replace(/\s+/g, ' ').slice(0, TEXT_CHARS);
      const known = this.mails.find((x) => x.uid === m.uid);
      if (known) Object.assign(known, { ...m, text, summary: m.summary || known.summary, importance: m.importance || known.importance });
      else this.mails.push({ ...m, text, replied: false, nagged: false });
    }
    this.commit();
  }

  update(uid: number, patch: Partial<StoredMail>) {
    const m = this.mails.find((x) => x.uid === uid);
    if (m) { Object.assign(m, patch); this.commit(); }
  }

  /** Oublier tous les mails (débranchement de la boîte) */
  clear() {
    this.mails = [];
    this.commit();
  }

  /** Expéditeurs connus (pour reconnaître « Paul » dans une question) */
  senders() {
    return new Set(this.mails.flatMap((m) => tokens(m.from)));
  }

  private build() {
    const docs = this.mails.map((m) => {
      const words = [
        // l'expéditeur et l'objet comptent davantage que le corps
        ...tokens(`${m.from} ${m.fromAddress}`), ...tokens(`${m.from} ${m.fromAddress}`), ...tokens(`${m.from}`),
        ...tokens(m.subject), ...tokens(m.subject), ...tokens(m.summary), ...tokens(m.summary), ...tokens(m.text),
      ];
      const tf = new Map<string, number>();
      for (const w of words) tf.set(w, (tf.get(w) ?? 0) + 1);
      return { tf, length: words.length };
    });
    const df = new Map<string, number>();
    for (const d of docs) for (const w of d.tf.keys()) df.set(w, (df.get(w) ?? 0) + 1);
    const lengths = docs.map((d) => d.length);
    this.index = { docs: docs.map((d) => d.tf), lengths, df, avg: lengths.reduce((a, b) => a + b, 0) / Math.max(lengths.length, 1) };
    return this.index;
  }

  /** Les mails qui répondent le mieux à `query` (BM25), les plus récents en cas d'égalité */
  search(query: string, k = 4) {
    const q = [...new Set(tokens(query))];
    if (!q.length || !this.mails.length) return [];
    const { docs, lengths, df, avg } = this.index ?? this.build();
    const N = docs.length, k1 = 1.2, b = 0.75;
    const scored = docs.map((tf, i) => {
      let score = 0;
      for (const w of q) {
        const f = tf.get(w);
        if (!f) continue;
        const idf = Math.log(1 + (N - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * lengths[i]) / avg)));
      }
      return { mail: this.mails[i], score };
    }).filter((s) => s.score > 0);
    scored.sort((a, b) => b.score - a.score || b.mail.date - a.mail.date);
    // on ne garde que ce qui est proche du meilleur résultat
    const best = scored[0]?.score ?? 0;
    return scored.filter((s) => s.score >= best * 0.35).slice(0, k);
  }
}

/**
 * La question pourrait-elle trouver sa réponse dans ses mails ? Mots du courrier, expéditeur connu,
 * ou question sur ses propres affaires (« mon train part quand ? », « combien je paie… »).
 */
export function aboutMail(question: string, box: Mailbox) {
  if (!box.mails.length) return false;
  // (pas de \b : il ne reconnaît pas les lettres accentuées comme « à »)
  if (/(^|[\s'’])(quand|combien|à quelle heure|quel jour|quelle date|où|when|how much|what time|which day|where|khi nào|bao nhiêu|mấy giờ|ở đâu)([\s?,.!]|$)/i.test(question)
    && /(^|[\s'’])(mon|ma|mes|je|j|my|i|tớ|mình)([\s'’,.?]|$)/i.test(question)) return true;
  if (/\b(mails?|e-?mails?|courriels?|messages?|écrit|ecrit|envoy|répondu|repondu|reçu|recu|demandé|demande|facture|commande|livraison|invitation|pièce jointe|devis|newsletter|inbox|wrote|sent|replied|received|asked|invoice|order|delivery|thư|gửi|hỏi|hóa đơn)/i.test(question)) return true;
  const senders = box.senders();
  return tokens(question).some((w) => w.length > 2 && senders.has(w));
}

/** Les mails retrouvés, à glisser avant la question */
export function mailContext(found: { mail: StoredMail }[], lang: Lang) {
  const locale = { fr: 'fr-FR', en: 'en-GB', vi: 'vi-VN' }[lang];
  const lines = found.map(({ mail: m }) => {
    const date = new Date(m.date).toLocaleDateString(locale, { day: 'numeric', month: 'long' });
    return `- ${date}, ${m.from} <${m.fromAddress}>, « ${m.subject} » : ${m.summary ? `${m.summary} — ` : ''}${m.text.slice(0, 500)}`;
  });
  return lang === 'fr'
    ? `Mails retrouvés dans sa boîte (sers-t'en seulement s'ils répondent à sa question ; précise de qui et de quand ; n'invente rien de plus) :\n${lines.join('\n')}`
    : `Emails found in their inbox (use them only if they answer the question; say who and when; don't make up anything else):\n${lines.join('\n')}`;
}

const KEYWORDS = {
  type: 'object',
  properties: { pertinent: { type: 'boolean' }, mots: { type: 'array', items: { type: 'string' } } },
  required: ['pertinent', 'mots'],
};

/**
 * Les mots à chercher dans ses mails pour répondre à `question` : ceux de la question, plus ceux
 * qu'un mail emploierait (« mon train » → billet, SNCF, départ). Null si ses mails n'y peuvent rien.
 */
export async function mailQuery(brain: { extract<T>(task: string, schema: object): Promise<T | null> }, question: string) {
  const r = await brain.extract<{ pertinent: boolean; mots: string[] }>([
    'Ton humain te pose une question. Sa réponse pourrait-elle se trouver dans ses propres mails (billets, factures, commandes, rendez-vous, messages de proches ou de collègues…) ?',
    '« pertinent » : true si oui. « mots » : 3 à 8 mots-clés qu’un tel mail contiendrait (noms, expéditeurs probables, synonymes), dans la langue des mails.',
    'Exemple : « Mon train pour Paris part à quelle heure ? » → {"pertinent":true,"mots":["billet","train","SNCF","Paris","départ","voyage"]}',
    'Exemple : « Raconte-moi une blague » → {"pertinent":false,"mots":[]}',
    '',
    `Question : ${question}`,
  ].join('\n'), KEYWORDS);
  if (!r?.pertinent) return null;
  return `${question} ${r.mots.join(' ')}`;
}
