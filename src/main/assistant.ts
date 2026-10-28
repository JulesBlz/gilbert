// L'assistant : relie mails, agenda et échéances à Gilbert.
// - Un mail important arrive → Gilbert sursaute et le résume ; s'il fixe une date, il propose l'échéance.
// - Une réunion commence dans 10 minutes → il prévient.
// - Une échéance approche (J-3, J-1, le jour même, 2 h avant) → il le rappelle.
// - Première ouverture du jour → le brief : il attend d'avoir lu l'agenda et les mails de la nuit,
//   puis fait le point en quelques bulles (les mails de la nuit y sont, pas en alertes séparées).
// Quand tu es là, il descend te le dire tout de suite. En mode Chut ou quand tu n'es pas devant
// l'écran, tout attend ton retour : s'il s'est passé plusieurs choses, il te fait un petit récap
// (« pendant ton absence… »), en quelques bulles comme le brief, puis pose ses questions.
// Ses remarques sur l'écran ou la musique, elles, n'attendent pas : périmées, elles sont oubliées.

import { app, clipboard, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Calendar, normalizeUrl } from './calendar';
import { MailWatcher, type IncomingMail } from './mail';
import { TaskStore } from './tasks';
import { Mailbox, type StoredMail } from './mailbox';
import type { Weather } from './brief';
import { getSecret, setSecret } from './secrets';
import { triageMail } from './brain/triage';
import { BriefStore, type Held, birthdays, eveningEmpty, isoDay, plainBrief, plainEvening, plainRecap, writeBrief, writeEvening, writeRecap, type BriefFacts, type EveningFacts } from './brief';
import type { Brain } from './brain/brain';
import type { MemoryStore } from './memory';
import { LOCALE, SPEAK, type CalendarEvent, type Command, type ConnStatus, type Lang, type MailSettings, type Today } from '../shared/types';

interface Saved {
  mail: MailSettings | null;
  lastUid: number;
  calendarUrl: string;
  /** Identifiant d'un agenda privé (le mot de passe est rangé à part, chiffré) */
  calendarUser?: string;
  /** Compte dont le dernier mois a déjà été relu pour la mémoire des mails */
  backfilled?: string;
}

interface Pending {
  id: string;
  text: string;
  urgent: boolean;
  actions?: { label: string; value: string }[];
  onAnswer?: (value: string) => void;
  /** Le fait brut, daté, pour le récap d'absence (sinon `text`) */
  fact?: string;
  /** Remarque du moment (écran, musique) : sans intérêt si elle a attendu */
  transient?: boolean;
  /** Arrivé à (ms) ; rempli par notify() */
  at?: number;
  /** À dire même sans clavier ni souris depuis un moment (devant une vidéo) */
  evenIdle?: boolean;
  /** Assez urgent pour interrompre une session de travail */
  pierce?: boolean;
  /** Il sursaute avec son « ! » (ce qui vient d'arriver) */
  alert?: boolean;
}

const AWAY_AFTER = 60;          // s sans clavier ni souris : les messages attendent ton retour
const EVENT_NOTICE_MS = 10 * 60_000;
const file = () => path.join(app.getPath('userData'), 'connections.json');

export class Assistant {
  readonly calendar = new Calendar();
  readonly mail = new MailWatcher((uid) => { this.saved.lastUid = uid; this.save(); });
  readonly tasks = new TaskStore();
  /** La mémoire des mails (recherche par mots-clés, mails qui attendent ta réponse) */
  readonly mailbox = new Mailbox();
  private lastBirthdayCheck = 0;
  /** Dernière vérification des mails restés sans réponse */
  private lastReplyCheck = Date.now() - 3 * 3600_000 + 5 * 60_000;
  private saved: Saved;
  private queue: Pending[] = [];
  private waiting = new Map<string, Pending>();
  private noticedEvents = new Set<string>();
  private importantMails: { from: string; summary: string; at: number }[] = [];
  private timer: NodeJS.Timeout | null = null;
  readonly brief = new BriefStore();
  /** Le brief se prépare : les mails sont gardés pour lui au lieu d'être annoncés un par un */
  private briefing = false;
  private nightBacklog = 0;
  private mailSynced = false;
  private triaging = 0;
  /** Ce qui arrive pendant le brief et attend sa fin (une échéance à ajouter, par exemple) */
  private later: Omit<Pending, 'id'>[] = [];
  /** Les bulles du brief sont en train d'être dites */
  private telling = false;
  /** Ce qui joue en ce moment (« « titre » de artiste »), vide sinon */
  private nowPlaying = '';

  constructor(private deps: {
    brain: Brain;
    memory: MemoryStore;
    send: (cmd: Command) => void;
    lang: () => Lang;
    quiet: () => boolean;
    userIdle: () => number;
    /** Une session de travail est en cours : rien que l'urgent */
    focusing: () => boolean;
    /** Un mail important vient d'arriver (pour le carnet de bord) */
    onImportantMail?: () => void;
    /** Sessions de travail du jour, pour le bilan du soir */
    focusToday?: () => { sessions: number; minutes: number };
    /** Son humeur du moment, pour sa personnalité (vide si neutre ou désactivé) */
    moodLine?: () => string;
    /** Une fonction du guide vient de servir pour de vrai (le brief, le bilan du soir) */
    used?: (key: string) => void;
    onStatus: (s: { mail: ConnStatus; calendar: ConnStatus }) => void;
  }) {
    try {
      this.saved = { mail: null, lastUid: 0, calendarUrl: '', ...JSON.parse(readFileSync(file(), 'utf8')) };
    } catch {
      this.saved = { mail: null, lastUid: 0, calendarUrl: '' };
    }
    this.mail.on('mail', (m: IncomingMail) => {
      this.triaging++;
      this.onMail(m).catch(() => {}).finally(() => this.triaging--);
    });
    this.mail.on('synced', () => {
      this.mailSynced = true;
      this.backfill().catch(() => {});
    });
    this.mail.on('backlog', (n: number) => this.briefing ? (this.nightBacklog = n) : this.notify({ text: this.t(`Tu as ${n} nouveaux mails depuis tout à l'heure. Trop pour tout lire d'un coup.`, `You have ${n} new emails since earlier. Too many to read at once.`, `Cậu có ${n} email mới từ nãy giờ. Nhiều quá, tớ không đọc hết được.`), urgent: false }));
    for (const source of [this.mail, this.calendar]) source.on('status', () => this.deps.onStatus(this.status()));
    this.calendar.on('events', () => this.refreshContext());
    this.tasks.on('change', () => this.refreshContext());
  }

  /** Le texte dans la langue choisie (le vietnamien, quand il manque, retombe sur l'anglais) */
  private t(fr: string, en: string, vi?: string) {
    const lang = this.deps.lang();
    return lang === 'fr' ? fr : lang === 'vi' ? vi ?? en : en;
  }

  private save() {
    mkdirSync(path.dirname(file()), { recursive: true });
    writeFileSync(file(), JSON.stringify(this.saved, null, 2));
  }

  start() {
    const pass = getSecret('mail');
    if (this.saved.mail && pass) this.mail.start(this.saved.mail, pass, this.saved.lastUid);
    if (this.saved.calendarUrl) this.calendar.use(this.saved.calendarUrl, this.calendarAuth()).catch(() => {});
    this.timer = setInterval(() => this.tick(), 15_000);
    this.refreshContext();
    if (this.brief.due()) this.runBrief().catch(() => { this.briefing = false; });
  }

  /** Le brief d'aujourd'hui n'a pas encore été dit */
  get briefPending() {
    return this.briefing || this.brief.due();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.mail.stop();
    this.calendar.stop();
  }

  // ---------- réglages (fenêtre Connexions) ----------

  status() {
    return { mail: this.mail.status, calendar: this.calendar.status };
  }

  settings() {
    return {
      mail: this.saved.mail, hasPassword: Boolean(getSecret('mail')),
      calendarUrl: this.saved.calendarUrl, calendarUser: this.saved.calendarUser ?? '', hasCalendarPassword: Boolean(getSecret('calendar')),
    };
  }

  private calendarAuth() {
    const user = this.saved.calendarUser ?? '', password = getSecret('calendar');
    return user || password ? { user, password } : null;
  }

  async saveMail(m: MailSettings & { password: string }) {
    const settings: MailSettings = { address: m.address.trim(), host: m.host.trim(), port: Number(m.port) || 993, user: (m.user || m.address).trim() };
    // un mot de passe d'application s'affiche par blocs de 4 lettres : on retire les espaces
    const password = m.password.replace(/\s+/g, '') || getSecret('mail');
    if (!settings.address || !settings.host || !password) return { ok: false, message: this.t('Il manque l’adresse ou le mot de passe.', 'Address or password missing.', 'Thiếu địa chỉ hoặc mật khẩu.') };
    try {
      const count = await MailWatcher.test(settings, password);
      setSecret('mail', password);
      const sameAccount = this.saved.mail?.user === settings.user && this.saved.mail?.host === settings.host;
      this.saved.mail = settings;
      if (!sameAccount) this.saved.lastUid = 0;
      this.save();
      this.mail.start(settings, password, this.saved.lastUid);
      return { ok: true, message: this.t(`Connecté : ${count} mails dans la boîte de réception.`, `Connected: ${count} emails in the inbox.`, `Đã kết nối: ${count} email trong hộp thư đến.`) };
    } catch (err) {
      const e = err as { authenticationFailed?: boolean; message?: string };
      return {
        ok: false,
        message: e.authenticationFailed
          ? this.t('Identifiants refusés. Vérifie l’adresse et le mot de passe d’application.', 'Credentials refused. Check the address and the app password.', 'Thông tin đăng nhập bị từ chối. Kiểm tra địa chỉ và mật khẩu ứng dụng.')
          : this.t(`Connexion impossible : ${e.message ?? 'erreur inconnue'}`, `Could not connect: ${e.message ?? 'unknown error'}`, `Không kết nối được: ${e.message ?? 'lỗi không rõ'}`),
      };
    }
  }

  disconnectMail() {
    this.mail.stop();
    this.mailbox.clear();
    this.saved.backfilled = '';
    setSecret('mail', '');
    this.saved.mail = null;
    this.saved.lastUid = 0;
    this.save();
  }

  /** `auth` : pour un agenda privé ; mot de passe vide = garder celui déjà enregistré */
  async saveCalendar(raw: string, auth?: { user: string; password: string }) {
    try {
      const url = normalizeUrl(raw);
      const user = auth?.user.trim() ?? '';
      const password = auth?.password || (user ? getSecret('calendar') : '');
      await this.calendar.use(url, user || password ? { user, password } : null);
      this.saved.calendarUrl = url;
      this.saved.calendarUser = user;
      setSecret('calendar', password);
      this.save();
      return { ok: true, message: this.t(`Agenda lu : ${this.calendar.events.length} événements dans les deux semaines.`, `Calendar read: ${this.calendar.events.length} events in the next two weeks.`, `Đã đọc lịch: ${this.calendar.events.length} sự kiện trong hai tuần tới.`) };
    } catch (err) {
      return { ok: false, message: this.t(`Agenda illisible : ${(err as Error).message}`, `Could not read the calendar: ${(err as Error).message}`, `Không đọc được lịch: ${(err as Error).message}`) };
    }
  }

  disconnectCalendar() {
    this.calendar.use('');
    this.saved.calendarUrl = '';
    this.saved.calendarUser = '';
    setSecret('calendar', '');
    this.save();
  }

  // ---------- mails ----------

  /** Au premier branchement d'un compte : le dernier mois rejoint la mémoire des mails */
  private async backfill() {
    const account = this.saved.mail?.user;
    if (!account || this.saved.backfilled === account) return;
    const list = await this.mail.backfill(30, 300);
    this.mailbox.add(list.filter((m) => !this.mailbox.has(m.uid)).map((m) => ({ ...m, summary: '', importance: '', needsReply: false })));
    this.saved.backfilled = account;
    this.save();
  }

  private async onMail(m: IncomingMail) {
    const tri = await triageMail(this.deps.brain, this.deps.memory.data, m, this.deps.lang());
    if (tri.importance === 'bruit') return;
    this.mailbox.add([{ ...m, summary: tri.summary, importance: tri.importance, needsReply: tri.needsReply }]);
    // chaque mail arrive avec son « ! » ; seul l'important passe pendant une session de travail
    if (tri.importance !== 'important') {
      if (!this.briefing) this.notify({ text: this.t(`Nouveau mail de ${m.from} : ${tri.summary}`, `New email from ${m.from}: ${tri.summary}`, `Email mới từ ${m.from}: ${tri.summary}`), urgent: false, alert: true, transient: true });
      return;
    }
    this.deps.onImportantMail?.();
    this.importantMails = [{ from: m.from, summary: tri.summary, at: m.date }, ...this.importantMails].slice(0, 8);
    this.refreshContext();
    if (!this.briefing) this.notify({ text: this.t(`Mail important de ${m.from} : ${tri.summary}`, `Important email from ${m.from}: ${tri.summary}`, `Email quan trọng từ ${m.from}: ${tri.summary}`), urgent: true, alert: true });

    const d = tri.deadline;
    if (d) {
      const when = this.day(d.date) + (d.time ? ` ${this.t('à', 'at', 'lúc')} ${d.time}` : '');
      (this.briefing ? (p: Omit<Pending, 'id'>) => this.later.push(p) : (p: Omit<Pending, 'id'>) => this.notify(p))({
        text: this.t(`J'ajoute l'échéance « ${d.what} », ${when} ?`, `Shall I add the deadline "${d.what}", ${when}?`, `Tớ thêm hạn chót « ${d.what} », ${when} nhé?`),
        urgent: false,
        actions: [{ label: this.t('Ajouter', 'Add', 'Thêm'), value: 'yes' }, { label: this.t('Non merci', 'No thanks', 'Thôi khỏi'), value: 'no' }],
        onAnswer: (v) => { if (v === 'yes') this.tasks.add({ title: d.what, due: d.date, time: d.time, source: 'mail' }); },
      });
    }
  }

  // ---------- notifications ----------

  /** Quelque chose à dire de sa propre initiative (ce qu'il voit à l'écran) ; attend la fin du brief */
  tell(text: string, actions?: Pending['actions'], onAnswer?: Pending['onAnswer'], evenIdle = false) {
    const p = { text, urgent: false, actions, onAnswer, transient: !actions, evenIdle };
    if (this.briefing || this.telling) this.later.push(p);
    else this.notify(p);
  }

  /** Ce qui vient d'arriver (un message) : il sursaute avec son « ! », sans insister */
  announce(text: string) {
    if (this.briefing || this.telling) this.later.push({ text, urgent: false, alert: true, transient: true });
    else this.notify({ text, urgent: false, alert: true, transient: true });
  }

  /** `own` : une bulle du brief ou du récap, qui passe devant ce qui attend sa fin */
  private notify(p: Omit<Pending, 'id'>, own = false) {
    if (this.telling && !own) {
      this.later.push(p);
      return;
    }
    this.queue.push({ at: Date.now(), ...p, id: randomUUID() });
    this.flush();
  }

  /** Réponse à un bouton de bulle */
  answer(id: string, value: string) {
    const p = this.waiting.get(id);
    this.waiting.delete(id);
    p?.onAnswer?.(value);
  }

  private present() {
    return !this.deps.quiet() && !this.deps.focusing() && this.deps.userIdle() < AWAY_AFTER;
  }

  /** Pourquoi les messages attendent : tu t'es absenté, ou mode Chut (pour la phrase du récap) */
  private heldBy: Held = 'away';

  /**
   * Envoie à Gilbert ce qui attend, si tu es là. Plusieurs choses arrivées pendant ton absence :
   * un récap en quelques bulles, puis les questions (échéance à ajouter…).
   */
  private flush() {
    if (!this.queue.length) return;
    if (!this.present()) {
      const focusing = this.deps.focusing();
      this.heldBy = this.deps.quiet() ? 'quiet' : focusing ? 'focus' : 'away';
      // devant une vidéo, ce qui doit être dit quand même part tout de suite ; en session de
      // travail, seul l'urgent passe (rendez-vous imminent, rappel à l'heure dite)
      const pass = (p: Pending) => (focusing ? Boolean(p.pierce) : Boolean(p.evenIdle));
      const now = this.queue.filter(pass);
      if (this.deps.quiet() || !now.length) return;
      this.queue = this.queue.filter((p) => !pass(p));
      for (const p of now) if (p.onAnswer) this.waiting.set(p.id, p);
      for (const p of now) this.deps.send({ type: 'notify', id: p.id, text: p.text, urgent: p.urgent, alert: p.alert, actions: p.actions });
      return;
    }
    const now = Date.now();
    const list = this.queue.splice(0).filter((p) => !(p.transient && now - (p.at ?? now) > 2 * 60_000));
    const info = list.filter((p) => !p.actions && !p.onAnswer);
    if (info.length >= 2) {
      this.later.push(...list.filter((p) => !info.includes(p)));
      this.telling = true;
      this.recap(info).catch(() => { this.sayBubbles(info.map((p) => p.text)); });
      return;
    }
    // un message à la fois : Gilbert enchaîne de lui-même (la file d'attente est dans l'interface)
    for (const p of list) {
      if (p.onAnswer) this.waiting.set(p.id, p);
      this.deps.send({ type: 'notify', id: p.id, text: p.text, urgent: p.urgent, alert: p.alert, actions: p.actions });
    }
  }

  // ---------- agenda et échéances ----------

  private tick() {
    // pendant la préparation du brief, il dira tout d'un coup
    if (this.briefing) return;
    const now = Date.now();
    if (now - this.lastReplyCheck > 3 * 3600_000) {
      this.lastReplyCheck = now;
      this.checkReplies().catch(() => {});
    }
    if (now - this.lastBirthdayCheck > 3600_000 && this.present()) {
      this.lastBirthdayCheck = now;
      this.birthdays().catch(() => {});
    }
    // le soir, une fois, quand tu es là et qu'il n'est pas déjà en train de parler
    if (this.brief.eveningDue() && !this.telling && !this.queue.length && this.present()) {
      this.brief.eveningDone();
      this.evening().catch(() => {});
    }
    for (const e of this.calendar.events) {
      if (e.allDay || this.noticedEvents.has(e.id)) continue;
      if (e.start - now <= EVENT_NOTICE_MS && e.start > now - 60_000) {
        this.noticedEvents.add(e.id);
        const mins = Math.max(1, Math.round((e.start - now) / 60_000));
        const at = new Date(e.start).toLocaleTimeString(LOCALE[this.deps.lang()], { hour: '2-digit', minute: '2-digit' });
        this.notify({
          text: this.t(`Dans ${mins} min : ${e.title}${e.location ? ` (${e.location})` : ''}.`, `In ${mins} min: ${e.title}${e.location ? ` (${e.location})` : ''}.`, `${mins} phút nữa: ${e.title}${e.location ? ` (${e.location})` : ''}.`),
          fact: this.t(`Rendez-vous « ${e.title} » à ${at}${e.location ? ` (${e.location})` : ''}`, `Appointment "${e.title}" at ${at}${e.location ? ` (${e.location})` : ''}`),
          urgent: true,
          pierce: true,
        });
      }
    }
    for (const { task, kind } of this.tasks.dueReminders(now)) {
      if (task.source === 'chat') {
        // un rappel demandé : à l'heure dite, avec de quoi le cocher ou le repousser
        this.notify({
          text: this.t(`C'est l'heure : ${task.title}.`, `It's time: ${task.title}.`, `Đến giờ rồi: ${task.title}.`),
          fact: this.t(`Rappel « ${task.title} »${task.time ? ` à ${task.time}` : ''}`, `Reminder "${task.title}"${task.time ? ` at ${task.time}` : ''}`),
          urgent: true,
          pierce: true,
          actions: [
            { label: this.t('Fait', 'Done', 'Xong'), value: 'done' },
            { label: this.t('Dans 10 min', 'In 10 min', '10 phút nữa'), value: 'snooze' },
          ],
          onAnswer: (v) => (v === 'done' ? this.tasks.done(task.id) : this.tasks.snooze(task.id, 10)),
        });
        continue;
      }
      const label = {
        'j-3': this.t('dans 3 jours', 'in 3 days', 'còn 3 ngày'),
        'j-1': this.t('demain', 'tomorrow', 'ngày mai'),
        jour: this.t("aujourd'hui", 'today', 'hôm nay'),
        'h-2': this.t('dans 2 heures', 'in 2 hours', 'còn 2 tiếng'),
      }[kind] ?? '';
      this.notify({
        text: this.t(`Échéance ${label} : ${task.title}.`, `Deadline ${label}: ${task.title}.`, `Hạn chót ${label}: ${task.title}.`),
        fact: this.t(`Échéance « ${task.title} » : ${this.day(task.due)}${task.time ? ` à ${task.time}` : ''}`, `Deadline "${task.title}": ${this.day(task.due)}${task.time ? ` at ${task.time}` : ''}`),
        urgent: kind === 'h-2' || kind === 'jour',
      });
    }
    this.flush();
  }

  /** Ce qui presse : rendez-vous dans l'heure et demie, ou échéance du jour (dans les 4 h si elle a une heure) */
  pressure(): { what: string; minutes: number } | null {
    const now = Date.now();
    const soon: { what: string; minutes: number }[] = [];
    for (const e of this.calendar.events) {
      if (!e.allDay && e.start > now && e.start - now < 90 * 60_000) soon.push({ what: e.title, minutes: Math.round((e.start - now) / 60_000) });
    }
    const today = isoDay(new Date());
    for (const t of this.tasks.upcoming(now, 1)) {
      if (t.due !== today) continue;
      if (!t.time) { soon.push({ what: t.title, minutes: Math.max(60, Math.round((new Date().setHours(23, 59) - now) / 60_000)) }); continue; }
      const at = new Date(`${t.due}T${t.time}`).getTime();
      if (at > now && at - now < 4 * 3600_000) soon.push({ what: t.title, minutes: Math.round((at - now) / 60_000) });
    }
    return soon.sort((a, b) => a.minutes - b.minutes)[0] ?? null;
  }

  /** Le bilan du soir : fait, reste, demain, mails en attente (false s'il n'y a rien à dire) */
  async evening() {
    const lang = this.deps.lang();
    const locale = LOCALE[lang];
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const tomorrowDay = isoDay(tomorrow), today = isoDay(now);
    const hm = (t: number) => new Date(t).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    const f: EveningFacts = {
      done: this.tasks.doneToday().map((t) => t.title),
      left: this.tasks.upcoming(now.getTime(), 1).filter((t) => t.due === today).map((t) => `${t.title}${t.time ? ` (${t.time})` : ''}`),
      tomorrow: [
        ...this.calendar.events.filter((e) => isoDay(new Date(e.start)) === tomorrowDay).map((e) => `${e.allDay ? '' : `${hm(e.start)} `}${e.title}`),
        ...this.tasks.tasks.filter((t) => !t.done && t.due === tomorrowDay).map((t) => `${this.t('échéance', 'deadline', 'hạn chót')} « ${t.title} »${t.time ? ` ${t.time}` : ''}`),
      ],
      waiting: this.waitingMails().map((m) => m.from),
      focus: (() => {
        const f = this.deps.focusToday?.();
        return f?.sessions ? this.t(`${f.sessions} session${f.sessions > 1 ? 's' : ''} de travail, ${f.minutes} min`, `${f.sessions} work session${f.sessions > 1 ? 's' : ''}, ${f.minutes} min`) : '';
      })(),
    };
    if (eveningEmpty(f)) return false;
    const brain = this.deps.brain;
    this.telling = true;
    this.deps.send({ type: 'thinking', on: true });
    const bubbles = (brain.status.state === 'ready' && await writeEvening(brain, f, lang)) || plainEvening(f, lang);
    this.deps.send({ type: 'thinking', on: false });
    this.sayBubbles(bubbles);
    this.deps.used?.('evening');
    return true;
  }

  /** Ta journée, pour l'Accueil de la fenêtre : météo, rendez-vous, échéances, mails qui attendent */
  today(): Today {
    const now = Date.now();
    const lang = this.deps.lang();
    const day = isoDay(new Date());
    const hm = (t: number) => new Date(t).toLocaleTimeString(LOCALE[lang], { hour: '2-digit', minute: '2-digit' });
    const w = this.weather;
    const p = this.deps.memory.data.profile;
    return {
      name: p.nickname || p.name,
      weather: w ? this.t(`${w.sky}, ${w.min} à ${w.max} °C à ${w.place}`, `${w.sky}, ${w.min} to ${w.max} °C in ${w.place}`, `${w.sky}, ${w.min} đến ${w.max} °C ở ${w.place}`) : '',
      events: this.calendar.events
        .filter((e) => e.end > now && isoDay(new Date(e.start)) <= day)
        .slice(0, 8)
        .map((e) => ({ time: e.allDay ? '' : hm(e.start), title: e.title, now: e.start <= now })),
      // ce qui reste, ce qui est fait aujourd'hui, et toutes les étapes des tâches pas encore finies
      tasks: this.tasks.tasks.filter((t, _, all) => !t.done || this.tasks.doneToday().includes(t) || all.some((p) => p.id === t.parent && !p.done))
        .map((t) => ({ id: t.id, title: t.title, due: t.due, time: t.time, done: t.done, parent: t.parent })),
      waiting: this.waitingMails().map((m) => m.from),
    };
  }

  // ---------- mails restés sans réponse ----------

  /** Les mails qui attendent ta réponse depuis 2 à 10 jours (sans relance déjà faite) */
  private waitingMails(now = Date.now()) {
    const day = 86_400_000;
    return this.mailbox.mails.filter((m) => m.needsReply && !m.replied && now - m.date > 2 * day && now - m.date < 10 * day);
  }

  /** Vérifie dans tes mails envoyés, puis relance (une fois) pour ceux qui attendent encore */
  private async checkReplies() {
    if (!this.saved.mail || this.mail.status.state !== 'on') return;
    const waiting = this.waitingMails();
    if (!waiting.length) return;
    const wrote = await this.mail.wroteTo(waiting.map((m) => m.fromAddress), new Date(Math.min(...waiting.map((m) => m.date))));
    for (const m of waiting) if (wrote.has(m.fromAddress.toLowerCase())) this.mailbox.update(m.uid, { replied: true });
    for (const m of waiting.filter((x) => !wrote.has(x.fromAddress.toLowerCase()) && !x.nagged).slice(0, 2)) {
      this.mailbox.update(m.uid, { nagged: true });
      const days = Math.floor((Date.now() - m.date) / 86_400_000);
      const what = m.summary || m.subject;
      this.notify({
        text: this.t(`${m.from} attend ta réponse depuis ${days} jours (${what}). Je te prépare un brouillon ?`,
          `${m.from} has been waiting for your reply for ${days} days (${what}). Want me to draft one?`,
          `${m.from} đang chờ cậu trả lời ${days} ngày rồi (${what}). Tớ soạn nháp giúp nhé?`),
        fact: this.t(`${m.from} attend ta réponse depuis ${days} jours : ${what}`, `${m.from} has been waiting ${days} days for a reply: ${what}`),
        urgent: false,
        actions: [
          { label: this.t('Un brouillon', 'A draft', 'Soạn nháp'), value: 'draft' },
          { label: this.t('Déjà fait', 'Already did', 'Trả lời rồi'), value: 'done' },
          { label: this.t('Laisse', 'Leave it', 'Kệ đi'), value: 'no' },
        ],
        onAnswer: (v) => {
          if (v === 'done') this.mailbox.update(m.uid, { replied: true });
          if (v === 'draft') this.draftReply(m).catch(() => {});
        },
      });
    }
  }

  /** Brouillon de réponse, écrit pour toi (tu le relis et tu l'envoies : Gilbert n'envoie jamais rien) */
  private async draftReply(m: StoredMail) {
    const name = this.deps.memory.data.profile.name;
    const task = [
      `Rédige une réponse au mail ci-dessous, AU NOM de ton humain${name ? ` (${name})` : ''} : c'est lui qui écrit et qui signe, pas toi.`,
      'Courte, naturelle, polie, dans le ton du mail reçu (tutoiement si on le tutoie). Pas d’objet, pas de formule « Gilbert ».',
      'Si une information te manque (une date, un prix…), laisse-la entre crochets, par exemple [date].',
      `Langue : celle du mail reçu. Écris uniquement la réponse.`,
      '',
      `De : ${m.from} <${m.fromAddress}>`,
      `Objet : ${m.subject}`,
      `Texte : ${m.text}`,
    ].join('\n');
    const draft = (await this.deps.brain.compose(task, 300))?.trim();
    if (!draft) return;
    clipboard.writeText(draft);
    const gmail = /gmail|googlemail/i.test(this.saved.mail?.host ?? '');
    this.tell(
      this.t('Brouillon copié : colle-le dans ta réponse, et relis-le, je ne signe pas à ta place.',
        "Draft copied: paste it into your reply, and read it over, I won't sign for you.",
        'Đã chép bản nháp: dán vào thư trả lời, và đọc lại nhé, tớ không ký thay cậu đâu.'),
      gmail ? [{ label: this.t('Ouvrir le mail', 'Open the email', 'Mở thư'), value: 'open' }] : undefined,
      (v) => { if (v === 'open') shell.openExternal(`https://mail.google.com/mail/u/0/#search/${encodeURIComponent(`from:${m.fromAddress} subject:(${m.subject})`)}`); },
    );
  }

  /** « mardi 3 novembre » */
  private day(isoDate: string) {
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(LOCALE[this.deps.lang()], { weekday: 'long', day: 'numeric', month: 'long' });
  }

  private when(e: CalendarEvent) {
    const locale = LOCALE[this.deps.lang()];
    const date = new Date(e.start).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
    return e.allDay ? date : `${date}, ${new Date(e.start).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;
  }

  /** Ce que Gilbert sait de ta semaine, pour ses réponses */
  context() {
    const now = Date.now();
    const lines: string[] = [];
    if (this.saved.calendarUrl) {
      const soon = this.calendar.events.filter((e) => e.end > now && e.start < now + 3 * 86_400_000).slice(0, 15);
      lines.push(this.t('Son agenda des 3 prochains jours :', 'Their calendar for the next 3 days:'));
      lines.push(...(soon.length ? soon.map((e) => `- ${this.when(e)} : ${e.title}${e.location ? ` (${e.location})` : ''}`) : [this.t('- rien de prévu', '- nothing planned')]));
    } else {
      lines.push(this.t("Tu n'as pas accès à son agenda : s'il t'en parle, dis-lui de te le brancher avec « Connexions » (sous le champ quand il clique sur toi).",
        "You can't see their calendar: if they ask, tell them to connect it with \"Connections\" (below the text field when they click you)."));
    }
    const tasks = this.tasks.upcoming(now, 7);
    if (tasks.length) {
      lines.push(this.t('Ses échéances :', 'Their deadlines:'));
      lines.push(...tasks.map((t) => `- ${this.day(t.due)}${t.time ? ` ${t.time}` : ''} : ${t.title}`));
    }
    const todo = this.tasks.tasks.filter((t) => !t.done && !t.due).slice(0, 15);
    if (todo.length) {
      lines.push(this.t('Sa liste de choses à faire (sans date) :', 'Their to-do list (no date):'));
      lines.push(...todo.map((t) => `- ${t.title}`));
    }
    const finished = this.tasks.doneToday();
    if (finished.length) lines.push(this.t(`Fait aujourd'hui : ${finished.map((t) => t.title).join(', ')}.`, `Done today: ${finished.map((t) => t.title).join(', ')}.`));
    if (this.saved.mail) {
      if (this.importantMails.length) {
        lines.push(this.t('Ses derniers mails importants :', 'Their latest important emails:'));
        lines.push(...this.importantMails.slice(0, 5).map((m) => `- ${m.from} : ${m.summary}`));
      } else {
        lines.push(this.t('Aucun mail important reçu depuis ton lancement.', 'No important email received since you started.'));
      }
    } else {
      lines.push(this.t("Tu ne lis pas ses mails : s'il t'en parle, dis-lui de te les brancher avec « Connexions ».",
        "You can't read their email: if they ask, tell them to connect it with \"Connections\"."));
    }
    const waiting = this.waitingMails();
    if (waiting.length) {
      lines.push(this.t('Mails qui attendent sa réponse :', 'Emails waiting for their reply:'));
      lines.push(...waiting.slice(0, 5).map((m) => `- ${m.from} : ${m.summary || m.subject}`));
    }
    if (this.weather) {
      const w = this.weather;
      lines.push(this.t(`Météo du jour à ${w.place} : ${w.sky}, ${w.min} à ${w.max} °C, ${w.rain} % de risque de pluie.`, `Today's weather in ${w.place}: ${w.sky}, ${w.min} to ${w.max} °C, ${w.rain}% chance of rain.`));
    }
    const mood = this.deps.moodLine?.();
    if (mood) lines.push(mood);
    if (this.nowPlaying) lines.push(this.t(`Il écoute en ce moment : ${this.nowPlaying}.`, `They are listening to ${this.nowPlaying}.`));
    return lines.join('\n');
  }

  setNowPlaying(text: string) {
    if (text === this.nowPlaying) return;
    this.nowPlaying = text;
    this.refreshContext();
  }

  private refreshContext() {
    this.deps.brain.setContext(this.context());
  }

  /** À appeler quand tu reviens ou que le mode Chut se termine */
  wake() {
    // Gilbert a passé la nuit allumé : le brief se fait à ton retour
    if (!this.briefing && this.brief.due()) this.runBrief().catch(() => { this.briefing = false; });
    this.flush();
  }

  // ---------- brief du jour ----------

  /**
   * Prépare et dit le brief. `again` : redemandé depuis le menu (même s'il a déjà été fait).
   * Il attend (sans trop traîner) que le cerveau soit chargé, l'agenda lu et les mails de la nuit triés.
   */
  async runBrief(again = false) {
    if (this.briefing) return;
    this.briefing = true;
    const brain = this.deps.brain;
    if (!again) {
      await until(() => brain.status.state !== 'loading', 120_000);
      if (this.saved.calendarUrl) await until(() => ['on', 'error'].includes(this.calendar.status.state), 25_000);
      if (this.saved.mail && getSecret('mail')) {
        await until(() => this.mailSynced || this.mail.status.state === 'error', 45_000);
        await until(() => this.triaging === 0, 120_000);
      }
    }
    this.deps.send({ type: 'thinking', on: true });
    const facts = await this.briefFacts(again);
    this.weather = facts.weather ? { ...facts.weather, at: Date.now() } : this.weather;
    const lang = this.deps.lang();
    const bubbles = (brain.status.state === 'ready' && await writeBrief(brain, facts, lang)) || plainBrief(facts, lang);
    this.deps.send({ type: 'thinking', on: false });
    if (!facts.weather && !this.deps.memory.data.profile.city && this.brief.takeCityHint()) {
      bubbles.push(this.t('Dis-moi dans quelle ville tu vis (dans mon carnet) et je te donnerai la météo.', 'Tell me which city you live in (in my notebook) and I’ll give you the weather.', 'Cho tớ biết cậu sống ở thành phố nào (trong sổ tay của tớ) để tớ báo thời tiết nhé.'));
    }
    if (!again) {
      this.brief.done();
      // les rappels d'échéances du jour sont dans le brief : pas la peine de les répéter
      this.tasks.dueReminders();
    }
    this.nightBacklog = 0;
    this.briefing = false;
    this.sayBubbles(bubbles);
    this.deps.used?.('brief');
  }

  /** La météo du jour (gardée 3 h), pour répondre quand on lui en parle */
  private weather: (Weather & { at: number }) | null = null;
  async todayWeather() {
    if (this.weather && Date.now() - this.weather.at < 3 * 3600_000) return this.weather;
    const w = await this.brief.weather(this.deps.memory.data.profile.city, this.deps.lang());
    this.weather = w ? { ...w, at: Date.now() } : null;
    this.refreshContext();
    return this.weather;
  }

  // ---------- anniversaires ----------

  /** 3 jours avant : une idée de cadeau ; le jour même : un petit message, écrit pour toi */
  private async birthdays() {
    const brain = this.deps.brain;
    if (brain.status.state !== 'ready') return;
    const now = new Date();
    const memory = this.deps.memory.data;
    // le tien d'abord : il te le souhaite, à sa façon
    const mine = memory.profile.birthday.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (mine && Number(mine[1]) === now.getDate() && Number(mine[2]) === now.getMonth() + 1 && this.brief.once(`bday-me-${now.getFullYear()}`)) {
      const wish = (await brain.compose(`C'est l'anniversaire de ton humain aujourd'hui ! Souhaite-le-lui en une ou deux phrases, ${SPEAK[this.deps.lang()]}, chaleureux et drôle, à ta façon de raton laveur.`, 80))?.trim();
      if (wish) this.notify({ text: wish, urgent: false });
    }
    for (const p of memory.people) {
      const m = p.birthday.match(/^(\d{1,2})\/(\d{1,2})$/);
      if (!m) continue;
      const day = new Date(now.getFullYear(), Number(m[2]) - 1, Number(m[1]));
      if (day.getTime() < new Date(now.toDateString()).getTime() - 86_400_000) day.setFullYear(now.getFullYear() + 1);
      const inDays = Math.round((day.getTime() - new Date(now.toDateString()).getTime()) / 86_400_000);
      const who = `${p.name}${p.relation ? ` (${p.relation})` : ''}`;
      const about = memory.facts.filter((f) => f.text.toLowerCase().includes(p.name.toLowerCase())).map((f) => f.text).slice(0, 6);
      if (inDays === 3 && this.brief.once(`bday-pre-${p.name}-${day.getFullYear()}`)) {
        const idea = (await brain.compose([
          `L'anniversaire de ${who} est dans 3 jours. Propose UNE idée de cadeau originale et réaliste, en une phrase de 20 mots maximum, ${SPEAK[this.deps.lang()]}.`,
          about.length ? `Ce que tu sais sur ${p.name} : ${about.join(' ; ')}.` : 'Tu ne sais rien de ses goûts : reste simple et universel, et dis-le avec humour.',
          'Écris seulement la phrase.',
        ].join('\n'), 80))?.trim();
        const when = day.toLocaleDateString(LOCALE[this.deps.lang()], { weekday: 'long' });
        this.notify({
          text: this.t(`L'anniversaire de ${who}, c'est ${when}.${idea ? ` ${idea}` : ''}`, `${who}'s birthday is on ${when}.${idea ? ` ${idea}` : ''}`, `Sinh nhật ${who} là ${when}.${idea ? ` ${idea}` : ''}`),
          urgent: false,
        });
      }
      if (inDays === 0 && this.brief.once(`bday-day-${p.name}-${day.getFullYear()}`)) {
        this.notify({
          text: this.t(`C'est l'anniversaire de ${who} aujourd'hui ! Je t'écris un petit message ?`, `It's ${who}'s birthday today! Shall I write a little message?`, `Hôm nay là sinh nhật ${who}! Tớ viết giúp một lời chúc nhé?`),
          urgent: false,
          actions: [{ label: this.t('Oui', 'Yes', 'Có'), value: 'yes' }, { label: this.t('Je gère', "I've got it", 'Tớ tự lo'), value: 'no' }],
          onAnswer: async (v) => {
            if (v !== 'yes') return;
            const name = memory.profile.name;
            const msg = (await brain.compose([
              `Écris un message d'anniversaire court et chaleureux pour ${who}, AU NOM de ton humain${name ? ` (${name})` : ''} : c'est lui qui l'envoie, pas toi.`,
              'Naturel, 2 ou 3 phrases, une touche personnelle si tu en sais assez, une pointe d’humour tendre. Pas de signature « Gilbert ».',
              about.length ? `Ce que tu sais sur ${p.name} : ${about.join(' ; ')}.` : '',
              `Langue : ${{ fr: 'français', en: 'anglais', vi: 'vietnamien' }[this.deps.lang()]}. Écris seulement le message.`,
            ].join('\n'), 160))?.trim();
            if (!msg) return;
            clipboard.writeText(msg);
            this.tell(this.t(`Copié, prêt à coller : « ${msg} »`, `Copied, ready to paste: "${msg}"`, `Đã chép, sẵn sàng để dán: « ${msg} »`));
          },
        });
      }
    }
  }

  private async briefFacts(again: boolean): Promise<BriefFacts> {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = dayStart.getTime() + 86_400_000;
    const memory = this.deps.memory.data;
    const since = again ? now.getTime() - 86_400_000 : Math.min(now.getTime() - 16 * 3600_000, dayStart.getTime() - 6 * 3600_000);
    return {
      now,
      name: memory.profile.name,
      weather: await this.brief.weather(memory.profile.city, this.deps.lang()),
      calendar: Boolean(this.saved.calendarUrl) && this.calendar.status.state === 'on',
      events: this.calendar.events.filter((e) => e.end > now.getTime() && e.start < dayEnd && (!e.allDay || isoDay(new Date(e.start)) <= isoDay(now))),
      tasks: this.tasks.upcoming(now.getTime(), 3),
      mail: Boolean(this.saved.mail),
      mails: this.importantMails.filter((m) => m.at >= since).slice(0, 4),
      backlog: this.nightBacklog,
      birthdays: birthdays(memory, now),
    };
  }

  /** Le récap de ce qui s'est passé pendant ton absence (ou ton mode Chut) */
  private async recap(items: Pending[]) {
    const lang = this.deps.lang();
    const locale = LOCALE[lang];
    const facts = items.map((p) => `(${new Date(p.at ?? Date.now()).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}) ${p.fact ?? p.text}`);
    const since = Math.min(...items.map((p) => p.at ?? Date.now()));
    const brain = this.deps.brain;
    this.deps.send({ type: 'thinking', on: true });
    const bubbles = (brain.status.state === 'ready' && await writeRecap(brain, facts, this.heldBy, since, lang)) || plainRecap(facts, this.heldBy, lang);
    this.deps.send({ type: 'thinking', on: false });
    this.sayBubbles(bubbles);
  }

  private chainTimer: NodeJS.Timeout | null = null;

  /** Plusieurs bulles à la suite (résumé de la semaine…), quand il n'est pas déjà en train de parler */
  tellBubbles(bubbles: string[]) {
    if (this.telling || this.briefing) {
      setTimeout(() => this.tellBubbles(bubbles), 60_000);
      return;
    }
    this.telling = true;
    this.sayBubbles(bubbles);
  }

  /** Une bulle après l'autre : « Suite » pour passer à la suivante, la dernière part toute seule */
  private sayBubbles(bubbles: string[]) {
    const [first, ...rest] = bubbles;
    this.telling = Boolean(first);
    if (this.chainTimer) clearTimeout(this.chainTimer);
    // personne n'a cliqué « Suite » : il laisse tomber la suite plutôt que de tout bloquer
    this.chainTimer = first && rest.length ? setTimeout(() => this.sayBubbles([]), 10 * 60_000) : null;
    if (!first) {
      for (const p of this.later.splice(0)) this.notify(p);
      return;
    }
    this.notify({
      text: first,
      urgent: false,
      actions: rest.length ? [{ label: this.t('Suite', 'Next', 'Tiếp'), value: 'next' }] : undefined,
      onAnswer: (v) => { if (v === 'next') this.sayBubbles(rest); },
    }, true);
    if (!rest.length) this.sayBubbles([]);
  }
}

/** Attend que `ok()` soit vrai, au plus `ms` millisecondes */
function until(ok: () => boolean, ms: number) {
  return new Promise<void>((resolve) => {
    const end = Date.now() + ms;
    const check = () => (ok() || Date.now() > end ? resolve() : setTimeout(check, 500));
    check();
  });
}
