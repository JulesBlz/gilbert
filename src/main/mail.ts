// Surveillance des mails en IMAP (Gmail, Outlook, iCloud…), avec un mot de passe d'application.
// La connexion reste ouverte (IDLE) : le serveur prévient dès qu'un mail arrive.
// Les mails déjà présents au premier branchement ne déclenchent rien.
// « Seulement la boîte principale » (réglage, activé par défaut) : avec Gmail, les onglets Promotions,
// Réseaux sociaux, Notifications et Forums sont laissés de côté (les spams ne sont jamais dans la
// boîte de réception) ; ailleurs, les lettres d'information et publicités.

import { EventEmitter } from 'node:events';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { ConnStatus, MailSettings } from '../shared/types';

export interface IncomingMail {
  uid: number;
  from: string;
  fromAddress: string;
  subject: string;
  date: number;
  /** Début du texte, nettoyé, pour le tri */
  text: string;
  /** Lettre d'information, publicité… (en-têtes List-Unsubscribe, Precedence: bulk) */
  bulk: boolean;
}

/** Au-delà, les mails reçus hors connexion sont résumés en un seul message */
const BACKLOG_LIMIT = 20;

export class MailWatcher extends EventEmitter {
  status: ConnStatus = { state: 'off' };
  private client: ImapFlow | null = null;
  private settings: MailSettings | null = null;
  private password = '';
  private lastUid = 0;
  private retry: NodeJS.Timeout | null = null;
  private backoff = 30_000;
  private stopped = true;
  /** Ne garder que la boîte principale (pas de pubs ni de réseaux sociaux) */
  primaryOnly = true;

  /** `lastUid` : dernier mail déjà vu (sauvegardé entre deux lancements), 0 si jamais branché */
  constructor(private saveLastUid: (uid: number) => void) {
    super();
  }

  private setStatus(s: ConnStatus) {
    this.status = s;
    this.emit('status', s);
  }

  /** Teste des identifiants sans rien garder */
  static async test(settings: MailSettings, password: string) {
    const client = new ImapFlow({
      host: settings.host, port: settings.port, secure: true,
      auth: { user: settings.user, pass: password }, logger: false,
    });
    try {
      await client.connect();
      const box = await client.mailboxOpen('INBOX', { readOnly: true });
      return box.exists;
    } finally {
      await client.logout().catch(() => {});
    }
  }

  /** Une connexion à part, le temps d'une lecture (la principale reste à l'écoute de la boîte) */
  private async session<T>(work: (client: ImapFlow) => Promise<T>): Promise<T> {
    if (!this.settings) throw new Error('pas de boîte branchée');
    const client = new ImapFlow({
      host: this.settings.host, port: this.settings.port, secure: true,
      auth: { user: this.settings.user, pass: this.password }, logger: false,
    });
    client.on('error', () => {});
    await client.connect();
    try {
      return await work(client);
    } finally {
      await client.logout().catch(() => {});
    }
  }

  /**
   * Relit les mails des `days` derniers jours (au plus `max`, les plus récents), pour la mémoire
   * des mails. Les lettres d'information sont laissées de côté.
   */
  async backfill(days = 30, max = 300): Promise<IncomingMail[]> {
    return this.session(async (client) => {
      await client.mailboxOpen('INBOX', { readOnly: true });
      const since = new Date(Date.now() - days * 86_400_000);
      const uids = ((await client.search({ since }, { uid: true })) || []).sort((a, b) => b - a).slice(0, max);
      const out: IncomingMail[] = [];
      if (!uids.length) return out;
      const primary = await this.primaryOf(client, uids);
      for await (const msg of client.fetch(uids.join(','), { uid: true, source: { start: 0, maxLength: 48 * 1024 } }, { uid: true })) {
        if (!msg.source || (primary && !primary.has(msg.uid))) continue;
        const mail = await parse(msg.uid, msg.source).catch(() => null);
        if (mail && !mail.bulk) out.push(mail);
      }
      return out;
    });
  }

  /** Parmi ces adresses, celles à qui tu as écrit depuis `since` (d'après tes mails envoyés) */
  async wroteTo(addresses: string[], since: Date): Promise<Set<string>> {
    return this.session(async (client) => {
      const boxes = await client.list();
      const sent = boxes.find((b) => b.specialUse === '\\Sent') ?? boxes.find((b) => /sent|envoy/i.test(b.path));
      const out = new Set<string>();
      if (!sent) return out;
      await client.mailboxOpen(sent.path, { readOnly: true });
      for (const address of new Set(addresses.map((a) => a.toLowerCase()))) {
        const found = await client.search({ to: address, since }, { uid: true }).catch(() => []);
        if (found && found.length) out.add(address);
      }
      return out;
    });
  }

  start(settings: MailSettings, password: string, lastUid: number) {
    this.stop();
    this.settings = settings;
    this.password = password;
    this.lastUid = lastUid;
    this.stopped = false;
    this.backoff = 30_000;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    const c = this.client;
    this.client = null;
    c?.logout().catch(() => c.close());
    this.setStatus({ state: 'off' });
  }

  private async connect() {
    if (this.stopped || !this.settings) return;
    this.setStatus({ state: 'connecting' });
    const client = new ImapFlow({
      host: this.settings.host, port: this.settings.port, secure: true,
      auth: { user: this.settings.user, pass: this.password },
      logger: false,
      // le serveur coupe les connexions inactives : on relance l'écoute régulièrement
      maxIdleTime: 10 * 60_000,
    });
    this.client = client;
    client.on('error', () => {});
    client.on('close', () => {
      if (this.client === client) this.scheduleRetry();
    });
    client.on('exists', () => this.fetchNew().catch(() => {}));
    try {
      await client.connect();
      const box = await client.mailboxOpen('INBOX', { readOnly: true });
      this.backoff = 30_000;
      // premier branchement : on part des mails actuels, sans tout notifier
      if (!this.lastUid) this.remember(Number(box.uidNext) - 1);
      this.setStatus({ state: 'on', detail: this.settings.address });
      await this.fetchNew();
      // les mails arrivés pendant l'absence sont lus (le brief du jour peut les attendre)
      this.emit('synced');
    } catch (err) {
      const e = err as { authenticationFailed?: boolean; message?: string };
      if (e.authenticationFailed) {
        // inutile d'insister : il faut corriger les identifiants
        this.stopped = true;
        this.setStatus({ state: 'error', message: 'identifiants refusés' });
        return;
      }
      this.setStatus({ state: 'error', message: e.message ?? 'connexion impossible' });
      this.scheduleRetry();
    }
  }

  private scheduleRetry() {
    if (this.stopped || this.retry) return;
    if (this.status.state === 'on') this.setStatus({ state: 'connecting' });
    this.retry = setTimeout(() => {
      this.retry = null;
      this.connect();
    }, this.backoff);
    this.backoff = Math.min(this.backoff * 2, 10 * 60_000);
  }

  private remember(uid: number) {
    if (uid > this.lastUid) {
      this.lastUid = uid;
      this.saveLastUid(uid);
    }
  }

  /** Gmail : parmi ces mails, ceux de l'onglet Principal (null : pas de filtre, ou pas Gmail) */
  private async primaryOf(client: ImapFlow, uids: number[]) {
    if (!this.primaryOnly || !uids.length || !client.capabilities.has('X-GM-EXT-1')) return null;
    const found = await client.search({ uid: uids.join(','), gmraw: 'category:primary' }, { uid: true }).catch(() => null);
    return found ? new Set(found) : null;
  }

  private fetching = false;

  /** Récupère les mails plus récents que le dernier vu */
  private async fetchNew() {
    const client = this.client;
    if (!client || this.fetching) return;
    this.fetching = true;
    try {
      const uids = (await client.search({ uid: `${this.lastUid + 1}:*` }, { uid: true })) || [];
      const fresh = uids.filter((u) => u > this.lastUid).sort((a, b) => a - b);
      if (!fresh.length) return;
      if (fresh.length > BACKLOG_LIMIT) {
        this.emit('backlog', fresh.length);
        this.remember(fresh[fresh.length - 1]);
        return;
      }
      const primary = await this.primaryOf(client, fresh);
      for (const uid of fresh) {
        this.remember(uid);
        if (primary && !primary.has(uid)) continue;
        const msg = await client.fetchOne(String(uid), { uid: true, source: { start: 0, maxLength: 96 * 1024 } }, { uid: true });
        if (!msg || !msg.source) continue;
        const mail = await parse(uid, msg.source);
        // hors Gmail : on reconnaît les pubs à leurs en-têtes
        if (this.primaryOnly && !primary && mail.bulk) continue;
        this.emit('mail', mail);
      }
    } finally {
      this.fetching = false;
    }
  }
}

async function parse(uid: number, source: Buffer): Promise<IncomingMail> {
  const m = await simpleParser(source, { skipImageLinks: true, skipTextToHtml: true });
  const from = m.from?.value?.[0];
  const text = (m.text ?? '')
    .replace(/^>.*$/gm, '') // citations des mails précédents
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500);
  return {
    uid,
    from: from?.name || from?.address || 'inconnu',
    fromAddress: from?.address ?? '',
    subject: m.subject ?? '(sans objet)',
    date: m.date?.getTime() ?? Date.now(),
    text,
    bulk: m.headers.has('list-unsubscribe') || /bulk|list/i.test(String(m.headers.get('precedence') ?? '')),
  };
}
