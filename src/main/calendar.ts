// L'agenda : lu depuis l'« adresse secrète au format iCal » de Google Agenda (lecture seule,
// sans compte développeur). Rafraîchi toutes les 5 minutes ; événements récurrents dépliés.

import { EventEmitter } from 'node:events';
import ICAL from 'ical.js';
import type { CalendarEvent, ConnStatus } from '../shared/types';

const REFRESH_MS = 5 * 60_000;
const DAY = 86_400_000;

/** webcal:// → https:// ; refuse ce qui n'est pas une adresse web */
const SECRET_ADDRESS = "prends l'« Adresse secrète au format iCal » (Paramètres de l'agenda → Intégrer l'agenda, tout en bas) : elle contient « private- » et marche même si ton agenda est privé, sans mot de passe";

const isGoogle = (url: string) => /^https?:\/\/(calendar\.google\.com|www\.google\.com\/calendar)\//i.test(url);

export function normalizeUrl(raw: string) {
  const url = raw.trim().replace(/^webcal:\/\//i, 'https://');
  if (/^[^\s/@]+@[^\s/@]+$/.test(url)) throw new Error(`c'est l'identifiant de l'agenda, pas son adresse : ${SECRET_ADDRESS}`);
  if (!/^https?:\/\//i.test(url)) throw new Error('adresse invalide');
  if (isGoogle(url)) {
    // les erreurs les plus courantes avec Google Agenda, repérées avant même d'essayer
    if (/\/public\/(basic|full)\.ics/i.test(url)) throw new Error(`c'est l'adresse publique, qui ne marche que si l'agenda est public : ${SECRET_ADDRESS}`);
    if (!/\/ical\//i.test(url)) throw new Error(`c'est le lien d'une page de Google Agenda, pas une adresse iCal : ${SECRET_ADDRESS}`);
  }
  return url;
}

/**
 * Lit un fichier iCal et renvoie les événements qui touchent la fenêtre [from, to],
 * récurrences comprises (avec leurs exceptions).
 */
export function parseIcs(text: string, from: number, to: number): CalendarEvent[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(tz);

  const all = root.getAllSubcomponents('vevent').map((v) => new ICAL.Event(v));
  const masters = all.filter((e) => !e.isRecurrenceException());
  for (const ex of all.filter((e) => e.isRecurrenceException())) {
    masters.find((m) => m.uid === ex.uid)?.relateException(ex);
  }

  const out: CalendarEvent[] = [];
  const push = (uid: string, summary: string, location: string, start: ICAL.Time, end: ICAL.Time) => {
    const s = start.toJSDate().getTime(), e = (end ?? start).toJSDate().getTime();
    if (e < from || s > to) return;
    out.push({ id: `${uid}@${s}`, title: summary || '(sans titre)', start: s, end: e, allDay: start.isDate, location: location || '' });
  };

  for (const ev of masters) {
    if (!ev.isRecurring()) {
      push(ev.uid, ev.summary, ev.location, ev.startDate, ev.endDate);
      continue;
    }
    const it = ev.iterator();
    for (let next = it.next(), guard = 0; next && guard < 2000; next = it.next(), guard++) {
      if (next.toJSDate().getTime() > to) break;
      const occ = ev.getOccurrenceDetails(next);
      push(ev.uid, occ.item.summary, occ.item.location, occ.startDate, occ.endDate);
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export class Calendar extends EventEmitter {
  events: CalendarEvent[] = [];
  status: ConnStatus = { state: 'off' };
  private url = '';
  /** Identifiant et mot de passe d'un agenda privé (authentification HTTP « Basic »), sinon null */
  private auth: { user: string; password: string } | null = null;
  private timer: NodeJS.Timeout | null = null;

  private setStatus(s: ConnStatus) {
    this.status = s;
    this.emit('status', s);
  }

  /** Change d'agenda (chaîne vide = débranché) ; lance un premier chargement */
  async use(url: string, auth: { user: string; password: string } | null = null) {
    this.url = url;
    this.auth = auth?.user || auth?.password ? auth : null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!url) {
      this.events = [];
      this.setStatus({ state: 'off' });
      this.emit('events', this.events);
      return;
    }
    this.timer = setInterval(() => this.refresh().catch(() => {}), REFRESH_MS);
    await this.refresh();
  }

  /** Télécharge et lit l'agenda : de la veille à dans deux semaines */
  async refresh() {
    if (!this.url) return;
    if (this.status.state !== 'on') this.setStatus({ state: 'connecting' });
    try {
      const headers: Record<string, string> = {};
      // Google n'accepte jamais de mot de passe ici : son adresse secrète contient déjà la clé
      const google = isGoogle(this.url);
      if (this.auth && !google) headers.Authorization = `Basic ${Buffer.from(`${this.auth.user}:${this.auth.password}`).toString('base64')}`;
      const res = await fetch(this.url, { headers, signal: AbortSignal.timeout(20_000) });
      if (google && !res.ok) {
        throw new Error(`Google refuse cette adresse (${res.status}) : ${SECRET_ADDRESS}. Avec un compte d'entreprise ou d'école, l'administrateur a pu désactiver cette adresse`);
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(this.auth ? 'identifiant ou mot de passe refusé' : 'cet agenda est privé : il faut son identifiant et son mot de passe');
      }
      if (!res.ok) throw new Error(`l'agenda répond ${res.status}`);
      const text = await res.text();
      if (!text.includes('BEGIN:VCALENDAR')) throw new Error("ce n'est pas une adresse iCal");
      const now = Date.now();
      this.events = parseIcs(text, now - DAY, now + 14 * DAY);
      this.setStatus({ state: 'on', detail: `${this.events.length} événements à venir` });
      this.emit('events', this.events);
    } catch (err) {
      this.setStatus({ state: 'error', message: (err as Error).message });
      throw err;
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
