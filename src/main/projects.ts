// Les fiches de suivi : un document par projet important, que Gilbert tient à jour tout seul. Il y range
// ce qui compte (un mail important ou qui attend ta réponse, une échéance, ce qu'il voit à l'écran) quand
// cela concerne le projet (son nom ou ses mots-clés), il te rappelle les échéances et ce que tu risques
// d'oublier, et il propose de créer une fiche quand il voit revenir un sujet. Tout reste dans
// projects.json, sur la machine.

import { app } from 'electron';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CalendarEvent, Lang, Project, ProjectAdvice, ProjectNote, ProjectTodo, ProjectView } from '../shared/types';
import type { StoredMail } from './mailbox';

const file = () => path.join(app.getPath('userData'), 'projects.json');
const DAY = 86_400_000;
const MAX_NOTES = 40;
const MAX_PROJECTS = 40;
const MAX_TODOS = 60;

/** Ce qu'il faut pour relier mails et agenda aux projets */
export interface Sources {
  mails: StoredMail[];
  events: CalendarEvent[];
  lang: Lang;
  now?: number;
}

/** Un sujet qui revient dans les mails sans fiche : au deuxième passage, il propose d'en créer une */
export interface Idea {
  name: string;
  keywords: string[];
  notes: { text: string; at: number }[];
  count: number;
  state: 'new' | 'asked' | 'declined';
  /** Repéré en regroupant les mails d'un même fil ou d'un même correspondant (clé du groupe) */
  cluster?: string;
  /** Nombre de mails du groupe, et le plus récent */
  mails?: number;
  last?: number;
  /** Les mails du groupe (uid), pour oublier l'idée si ces mails ne sont plus gardés */
  uids?: number[];
}

/** Un groupe de mails qui ressemble à un projet */
export interface Cluster { key: string; subject: string; from: string; mails: StoredMail[] }

const NOISE_SENDER = /(no[-_.]?reply|not[-_.]?reply|do[-_.]?not|flickr|medium|substack|notification|newsletter|mailer|bounce|alert|billing|invoice|receipt|updates?@|news@|marketing|promo|digest|linkedin|facebook|instagram|twitter|google|apple|amazon|paypal|netflix|spotify|github|notion|slack)/i;
const subjectKey = (s: string) => norm(s)
  .replace(/^((re|fwd?|tr|fw|ref)\s*:\s*)+/, '').replace(/\[[^\]]*\]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\b\d{3,}\b/g, ' ').replace(/\s+/g, ' ').trim();

export interface Reminder { text: string; fact: string; urgent: boolean }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const words = (v: string | string[]) => [...new Set((Array.isArray(v) ? v : v.split(/[,;\n]/)).map((k) => k.trim().slice(0, 60)).filter(Boolean))].slice(0, 20);
const today = (now: number) => new Date(now).toLocaleDateString('sv');
/** Jours entre aujourd'hui et `due` (négatif : en retard) */
const daysTo = (due: string, now: number) => Math.round((Date.parse(`${due}T12:00`) - Date.parse(`${today(now)}T12:00`)) / DAY);

/** Les mots qui désignent ce projet : son nom et ses mots-clés */
const termsOf = (p: Project) => [p.name, ...p.keywords].map(norm).filter((t) => t.length >= 3);

/** Le texte parle-t-il de ce projet ? (un mot entier, sans tenir compte des accents ni des majuscules) */
function mentions(p: Project, text: string) {
  const hay = norm(text);
  return termsOf(p).some((t) => new RegExp(`(^|[^a-z0-9])${esc(t)}([^a-z0-9]|$)`).test(hay));
}

export class ProjectStore extends EventEmitter {
  projects: Project[] = [];
  /** Recommandations écartées, ou déjà dites : leur id → quand */
  private dismissed: Record<string, number> = {};
  private told: Record<string, number> = {};
  private lastDigest = '';
  ideas: Record<string, Idea> = {};

  constructor() {
    super();
    try {
      const saved = JSON.parse(readFileSync(file(), 'utf8'));
      this.projects = (Array.isArray(saved.projects) ? saved.projects : []).map((p: Partial<Project> & { next?: string }) => ({
        id: p.id ?? randomUUID(), name: p.name ?? '', category: p.category ?? '', status: p.status ?? 'active', keywords: p.keywords ?? [],
        description: p.description ?? '', progress: p.progress ?? p.next ?? '', progressAuto: p.progressAuto ?? !(p.progress ?? p.next), todos: p.todos ?? [], notes: p.notes ?? [], doc: p.doc ?? '',
        createdAt: p.createdAt ?? Date.now(), updatedAt: p.updatedAt ?? Date.now(), seenAt: p.seenAt ?? 0, minutes: p.minutes ?? {},
      }));
      this.dismissed = saved.dismissed ?? {};
      this.told = saved.told ?? {};
      this.lastDigest = saved.lastDigest ?? '';
      this.ideas = saved.ideas ?? {};
    } catch { /* premier lancement */ }
  }

  private commit(quiet = false) {
    mkdirSync(path.dirname(file()), { recursive: true });
    const tmp = `${file()}.tmp`;
    writeFileSync(tmp, JSON.stringify({ projects: this.projects, dismissed: this.dismissed, told: this.told, lastDigest: this.lastDigest, ideas: this.ideas }, null, 2));
    renameSync(tmp, file());
    if (!quiet) this.emit('change');
  }

  get(id: string) {
    return this.projects.find((p) => p.id === id);
  }

  add(name: string, category = '', keywords: string | string[] = [], description = '') {
    name = name.trim().slice(0, 80);
    if (!name || this.projects.length >= MAX_PROJECTS) return null;
    const now = Date.now();
    const p: Project = {
      id: randomUUID(), name, category: category.trim().slice(0, 40), status: 'active', keywords: words(keywords), description: description.trim().slice(0, 400),
      progress: '', progressAuto: true, todos: [], notes: [], doc: '', createdAt: now, updatedAt: now, seenAt: 0, minutes: {},
    };
    this.projects.unshift(p);
    this.commit();
    return p;
  }

  edit(id: string, patch: Partial<Pick<Project, 'name' | 'category' | 'status' | 'description' | 'progress' | 'doc'> & { keywords: string[] | string }>) {
    const p = this.get(id);
    if (!p) return;
    if (typeof patch.name === 'string' && patch.name.trim()) p.name = patch.name.trim().slice(0, 80);
    if (typeof patch.category === 'string') p.category = patch.category.trim().slice(0, 40);
    if (patch.status === 'active' || patch.status === 'paused' || patch.status === 'done') p.status = patch.status;
    if (patch.keywords !== undefined) p.keywords = words(patch.keywords);
    if (typeof patch.description === 'string') p.description = patch.description.trim().slice(0, 400);
    // tu l'as écrit toi-même : il ne le réécrit plus (sauf si tu le vides, ou si tu le lui demandes)
    if (typeof patch.progress === 'string') { p.progress = patch.progress.trim().slice(0, 1200); p.progressAuto = !p.progress; }
    if (typeof patch.doc === 'string') p.doc = patch.doc.slice(0, 20_000);
    p.updatedAt = Date.now();
    this.commit();
  }

  remove(id: string) {
    this.projects = this.projects.filter((p) => p.id !== id);
    this.commit();
  }

  /** Le rapport écrit par Gilbert (il reste réécrit tout seul) */
  setReport(id: string, text: string) {
    const p = this.get(id);
    text = text.trim().slice(0, 1200);
    if (!p || !text) return;
    p.progress = text;
    p.progressAuto = true;
    this.commit();
  }

  // ---------- cases à cocher ----------

  addTodo(id: string, text: string, due = '', auto = false) {
    const p = this.get(id);
    text = text.trim().replace(/\s+/g, ' ').slice(0, 160);
    if (!p || !text || p.todos.length >= MAX_TODOS) return false;
    if (p.todos.some((t) => !t.done && norm(t.text) === norm(text))) return false;
    p.todos.push({ id: randomUUID(), text, due: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : '', done: false, auto, at: Date.now() });
    p.updatedAt = Date.now();
    this.commit();
    if (auto) this.emit('fresh', id);
    return true;
  }

  editTodo(id: string, todoId: string, patch: Partial<Pick<ProjectTodo, 'text' | 'due' | 'done'>>) {
    const t = this.get(id)?.todos.find((x) => x.id === todoId);
    if (!t) return;
    if (typeof patch.text === 'string' && patch.text.trim()) t.text = patch.text.trim().slice(0, 160);
    if (typeof patch.due === 'string' && (patch.due === '' || /^\d{4}-\d{2}-\d{2}$/.test(patch.due))) { t.due = patch.due; t.reminded = []; }
    if (typeof patch.done === 'boolean') t.done = patch.done;
    this.get(id)!.updatedAt = Date.now();
    this.commit();
  }

  removeTodo(id: string, todoId: string) {
    const p = this.get(id);
    if (!p) return;
    p.todos = p.todos.filter((t) => t.id !== todoId);
    this.commit();
  }

  // ---------- infos relevées ----------

  /** Ajoute une info (sans doublon) ; les plus anciennes partent quand il y en a trop */
  addNote(id: string, text: string, source: ProjectNote['source'], at = Date.now()) {
    const p = this.get(id);
    text = text.trim().replace(/\s+/g, ' ').slice(0, 240);
    if (!p || !text) return false;
    if (p.notes.some((n) => norm(n.text) === norm(text))) return false;
    p.notes.unshift({ id: randomUUID(), at, text, source });
    p.notes.sort((a, b) => b.at - a.at);
    if (p.notes.length > MAX_NOTES) p.notes.length = MAX_NOTES;
    p.updatedAt = Date.now();
    this.commit();
    if (source !== 'manual') this.emit('fresh', id);
    return true;
  }

  removeNote(id: string, noteId: string) {
    const p = this.get(id);
    if (!p) return;
    p.notes = p.notes.filter((n) => n.id !== noteId);
    this.commit();
  }

  /** Il t'a vu travailler dessus (sans faire de bruit : pas de rafraîchissement de la fenêtre à chaque fois) */
  touch(id: string) {
    const p = this.get(id);
    if (!p) return;
    p.seenAt = Date.now();
    this.commit(true);
  }

  dismiss(adviceId: string) {
    this.dismissed[adviceId] = Date.now();
    for (const [k, at] of Object.entries(this.dismissed)) if (Date.now() - at > 60 * DAY) delete this.dismissed[k];
    this.commit();
  }

  /** Les projets en cours dont ce texte parle */
  about(text: string) {
    return this.projects.filter((p) => p.status !== 'done' && mentions(p, text));
  }

  /** Un projet désigné par son nom (en entier ou en partie) */
  find(name: string) {
    const q = norm(name);
    if (!q) return null;
    return this.projects.find((p) => norm(p.name) === q) ?? this.projects.find((p) => norm(p.name).includes(q) || q.includes(norm(p.name))) ?? null;
  }

  /**
   * Un mail vient d'être trié : s'il compte (important, ou il attend ta réponse), il rejoint la fiche du
   * projet, avec ses échéances et, s'il attend une réponse, une case « Répondre à… ». Renvoie vrai si un
   * projet le concernait.
   */
  noteFromMail(m: { from: string; fromAddress: string; subject: string; date: number }, summary: string, important: boolean, needsReply: boolean, deadline: { what: string; date: string } | null) {
    let matched = false;
    for (const p of this.projects) {
      if (p.status === 'done' || !mentions(p, `${m.from} ${m.fromAddress} ${m.subject} ${summary}`)) continue;
      matched = true;
      if (!summary || (!important && !needsReply)) continue;
      this.addNote(p.id, `${m.from} : ${clip(summary, 180)}${needsReply ? ' (attend une réponse)' : ''}`, 'mail', m.date);
      if (deadline) this.addTodo(p.id, deadline.what, deadline.date, true);
      else if (needsReply) this.addTodo(p.id, `Répondre à ${m.from}`, '', true);
    }
    return matched;
  }

  // ---------- projets repérés dans les mails ----------

  /**
   * Regroupe les mails d'un même fil (même objet) ou d'un même correspondant : un groupe de deux mails ou plus dont un
   * compte (important, en attente de réponse, ou auquel tu as répondu) ressemble à un projet. Ne renvoie que ce qui n'est ni
   * déjà suivi, ni déjà proposé ou refusé.
   */
  clusters(mails: StoredMail[], now = Date.now()): Cluster[] {
    const recent = mails.filter((m) => m.importance !== 'bruit' && now - m.date < 60 * DAY && !NOISE_SENDER.test(`${m.fromAddress} ${m.from}`));
    const groups = new Map<string, StoredMail[]>();
    for (const m of recent) {
      const k = subjectKey(m.subject);
      if (k.length >= 6) groups.set(`s:${k}`, [...(groups.get(`s:${k}`) ?? []), m]);
    }
    const bySender = new Map<string, StoredMail[]>();
    for (const m of recent) if (m.fromAddress) bySender.set(`f:${m.fromAddress.toLowerCase()}`, [...(bySender.get(`f:${m.fromAddress.toLowerCase()}`) ?? []), m]);
    for (const [k, list] of bySender) if (list.length >= 3 && list.some((m) => m.importance === 'important' || m.needsReply || m.replied)) groups.set(k, list);
    const known = new Set(Object.values(this.ideas).map((i) => i.cluster).filter(Boolean));
    const out: (Cluster & { score: number })[] = [];
    for (const [key, list] of groups) {
      if (known.has(key)) continue;
      // un vrai projet : des échanges où quelque chose compte (important, attend ta réponse) ou où tu as répondu
      const matters = list.filter((m) => m.importance === 'important' || m.needsReply || m.replied).length;
      if (list.length < 2 || matters < 1) continue;
      const text = list.map((m) => `${m.from} ${m.fromAddress} ${m.subject} ${m.summary}`).join(' ');
      if (this.projects.some((p) => mentions(p, text))) continue;
      const sorted = [...list].sort((a, b) => b.date - a.date);
      out.push({ key, subject: sorted[0].subject, from: sorted[0].from, mails: sorted, score: list.length + 2 * matters + sorted.filter((m) => m.needsReply && !m.replied).length * 2 });
    }
    // un même fil compté deux fois (par objet et par correspondant) : on garde le plus gros
    const kept: typeof out = [];
    for (const c of out.sort((a, b) => b.score - a.score)) {
      const uids = new Set(c.mails.map((m) => m.uid));
      if (kept.some((k) => k.mails.filter((m) => uids.has(m.uid)).length > c.mails.length / 2)) continue;
      kept.push(c);
    }
    return kept.slice(0, 6);
  }

  /** Un groupe a été nommé par le cerveau : il devient une idée à proposer (ou, sans nom, une impasse qu'on ne reposera pas) */
  addCluster(c: Cluster, found: { name: string; keywords: string[] } | null) {
    const state = found ? 'new' : 'declined';
    const name = found?.name ?? c.subject.slice(0, 60);
    if (found && this.find(name)) return null;
    const key = `c:${c.key}`;
    this.ideas[key] = {
      name, keywords: found?.keywords ?? [], count: c.mails.length, state, cluster: c.key, mails: c.mails.length, last: c.mails[0]?.date ?? Date.now(), uids: c.mails.map((m) => m.uid),
      notes: c.mails.filter((m) => m.summary || m.subject).slice(0, 4).map((m) => ({ text: `${m.from} : ${clip(m.summary || m.subject, 180)}`, at: m.date })),
    };
    this.commit(true);
    return found ? { key, idea: this.ideas[key] } : null;
  }

  /** Oublie les idées repérées dont plus aucun mail n'est gardé (ils ont quitté la boîte principale) */
  forgetOrphanIdeas(mails: StoredMail[]) {
    const have = new Set(mails.map((m) => m.uid));
    let n = 0;
    for (const [k, i] of Object.entries(this.ideas)) {
      if (i.cluster && i.state !== 'declined' && i.uids?.length && !i.uids.some((u) => have.has(u))) { delete this.ideas[k]; n++; }
    }
    if (n) this.commit();
    return n;
  }

  /** Les idées à montrer dans l'onglet : celles repérées par regroupement (ou revenues deux fois), pas encore suivies ni écartées */
  suggestions(now = Date.now()) {
    return Object.entries(this.ideas)
      .filter(([, i]) => i.state !== 'declined' && (i.cluster || i.count >= 2) && !this.find(i.name))
      .map(([key, i]) => ({
        key, name: i.name,
        hint: `${i.mails ?? i.count} mail${(i.mails ?? i.count) > 1 ? 's' : ''}${i.last ? ` · ${Math.max(0, Math.round((now - i.last) / DAY))} j` : ''}`,
      }));
  }

  /** Remonte l'historique : les mails déjà reçus qui parlent de ce projet rejoignent sa fiche (infos, « répondre à… ») */
  backfill(id: string, mails: StoredMail[], now = Date.now()) {
    const p = this.get(id);
    if (!p || p.status === 'done') return 0;
    let added = 0, replies = 0;
    const mine = mails
          .filter((m) => m.importance !== 'bruit' && now - m.date < 90 * DAY && (m.needsReply || !NOISE_SENDER.test(`${m.fromAddress} ${m.from}`)) && mentions(p, `${m.from} ${m.fromAddress} ${m.subject} ${m.summary}`))
      .sort((a, b) => a.date - b.date);
    for (const m of mine.slice(-10)) {
      const what = m.summary || m.subject;
      if (!what) continue;
      if (this.addNote(p.id, `${m.from} : ${clip(what, 180)}${m.needsReply && !m.replied ? ' (attend une réponse)' : ''}`, 'mail', m.date)) added++;
      if (m.needsReply && !m.replied && now - m.date < 21 * DAY && replies < 3 && this.addTodo(p.id, `Répondre à ${m.from}`, '', true)) replies++;
    }
    return added;
  }

  /** Une minute passée devant ce projet (la fenêtre au premier plan en parle) */
  addMinute(id: string, now = Date.now()) {
    const p = this.get(id);
    if (!p) return;
    const m = (p.minutes ??= {});
    const day = today(now);
    m[day] = (m[day] ?? 0) + 1;
    for (const k of Object.keys(m)) if (now - Date.parse(`${k}T12:00`) > 120 * DAY) delete m[k];
    p.seenAt = now;
    this.commit(true);
  }

  // ---------- sujets qui reviennent ----------

  /** Un mail important sans fiche semble porter sur ce sujet : il le note ; au deuxième passage, renvoie l'idée à proposer */
  idea(name: string, keywords: string[], note: { text: string; at: number }) {
    const key = norm(name);
    if (key.length < 3 || this.find(name)) return null;
    const same = Object.keys(this.ideas).find((k) => k === key || (k.length >= 4 && (k.includes(key) || key.includes(k))));
    const i = (this.ideas[same ?? key] ??= { name: name.trim(), keywords: [], notes: [], count: 0, state: 'new' });
    i.count++;
    i.keywords = words([...i.keywords, ...keywords]).slice(0, 6);
    if (!i.notes.some((n) => norm(n.text) === norm(note.text))) i.notes.push(note);
    i.notes = i.notes.slice(-5);
    this.commit(true);
    return i.count >= 2 && i.state === 'new' ? { key: same ?? key, idea: i } : null;
  }

  markIdea(key: string, state: Idea['state']) {
    if (this.ideas[key]) this.ideas[key].state = state;
    this.commit(true);
  }

  /** Il a demandé, tu as dit oui : la fiche est créée avec ce qu'il avait relevé */
  createFromIdea(key: string) {
    const i = this.ideas[key];
    if (!i) return null;
    const p = this.add(i.name, '', i.keywords, '');
    if (!p) return null;
    for (const n of i.notes) this.addNote(p.id, n.text, 'mail', n.at);
    this.markIdea(key, 'asked');
    return p;
  }

  // ---------- rappels ----------

  /** Les échéances qui approchent (J-3, J-1, jour J) ou passées (une fois par jour), chacune dite une seule fois */
  reminders(lang: Lang, now = Date.now()): Reminder[] {
    const fr = lang === 'fr', vi = lang === 'vi';
    const out: Reminder[] = [];
    let changed = false;
    for (const p of this.projects) {
      if (p.status === 'done') continue;
      for (const t of p.todos) {
        if (t.done || !t.due) continue;
        const d = daysTo(t.due, now);
        const key = d === 3 ? 'j-3' : d === 1 ? 'j-1' : d === 0 ? 'jour' : d < 0 ? `retard:${today(now)}` : '';
        t.reminded ??= [];
        if (!key || t.reminded.includes(key)) continue;
        t.reminded.push(key);
        changed = true;
        const when = d === 3 ? (fr ? 'dans 3 jours' : vi ? 'còn 3 ngày' : 'in 3 days')
          : d === 1 ? (fr ? 'demain' : vi ? 'ngày mai' : 'tomorrow')
            : d === 0 ? (fr ? 'aujourd’hui' : vi ? 'hôm nay' : 'today')
              : (fr ? `en retard de ${-d} jour${d < -1 ? 's' : ''}` : vi ? `trễ ${-d} ngày` : `${-d} day${d < -1 ? 's' : ''} late`);
        out.push({
          text: fr ? `Projet « ${p.name} » : « ${t.text} », ${when}.` : vi ? `Dự án « ${p.name} »: « ${t.text} », ${when}.` : `Project "${p.name}": "${t.text}", ${when}.`,
          fact: fr ? `Échéance « ${t.text} » (${p.name}) : ${when}` : `Deadline "${t.text}" (${p.name}): ${when}`,
          urgent: d <= 0,
        });
      }
    }
    if (changed) this.commit(true);
    return out;
  }

  /** Une fois par jour, à partir de 9 h : ce que tu risques d'oublier (mail sans réponse, projet silencieux), s'il n'en a pas déjà parlé */
  digest(src: Sources): string | null {
    const now = src.now ?? Date.now();
    const day = today(now);
    if (this.lastDigest === day || new Date(now).getHours() < 9) return null;
    const items: string[] = [];
    for (const p of this.projects) {
      for (const a of this.view(p, src).advice.filter((x) => x.kind !== 'prepare' && !this.told[x.id])) {
        this.told[a.id] = now;
        items.push(`« ${p.name} » : ${a.text}`);
      }
    }
    this.lastDigest = day;
    this.commit(true);
    if (!items.length) return null;
    const fr = src.lang === 'fr';
    return `${fr ? 'Projets, à ne pas oublier' : src.lang === 'vi' ? 'Dự án, đừng quên' : 'Projects, don’t forget'} : ${items.slice(0, 3).join(' ; ')}${items.length > 3 ? '…' : ''}`;
  }

  // ---------- lecture ----------

  /** Ce que Gilbert lit avant de répondre à une question sur ce projet */
  context(p: Project, src: Sources, lang: Lang) {
    const v = this.view(p, src);
    const fr = lang === 'fr';
    return [
      fr ? `Fiche du projet « ${p.name} » (${p.category || 'sans catégorie'}, ${p.status})` : `Project sheet "${p.name}" (${p.category || 'no category'}, ${p.status})`,
      p.description, p.progress ? `${fr ? 'Avancement' : 'Progress'} : ${p.progress}` : '',
      ...p.todos.filter((t) => !t.done).slice(0, 8).map((t) => `${fr ? 'À ne pas oublier' : 'Remember'} : ${t.text}${t.due ? ` (${t.due})` : ''}`),
      ...p.notes.slice(0, 6).map((n) => `- ${new Date(n.at).toLocaleDateString(fr ? 'fr-FR' : 'en-GB')} : ${n.text}`),
      ...v.events.map((e) => `${fr ? 'Rendez-vous' : 'Event'} ${e.when} : ${e.title}`),
    ].filter(Boolean).join('\n');
  }

  /** Une ligne pour avant un rendez-vous : ce qu'il faut avoir en tête */
  brief(eventTitle: string, lang: Lang) {
    const p = this.about(eventTitle)[0];
    if (!p) return '';
    const last = p.progress || p.todos.find((t) => !t.done)?.text || p.notes[0]?.text;
    return last ? (lang === 'fr' ? `Fiche « ${p.name} » : ${clip(last, 120)}` : `Sheet "${p.name}": ${clip(last, 120)}`) : '';
  }

  view(p: Project, src: Sources): ProjectView {
    const now = src.now ?? Date.now();
    const fr = src.lang === 'fr';
    const day = (t: number) => new Date(t).toLocaleDateString(fr ? 'fr-FR' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const mails = src.mails
      .filter((m) => m.importance !== 'bruit' && mentions(p, `${m.from} ${m.fromAddress} ${m.subject} ${m.summary}`))
      .sort((a, b) => b.date - a.date);
    const events = src.events
      .filter((e) => e.end > now && e.start < now + 14 * DAY && mentions(p, `${e.title} ${e.location}`))
      .slice(0, 4);

    const advice: ProjectAdvice[] = [];
    if (p.status === 'active') {
      for (const m of mails.filter((m) => m.needsReply && !m.replied && now - m.date > DAY && now - m.date < 21 * DAY).slice(0, 2)) {
        const days = Math.round((now - m.date) / DAY);
        advice.push({
          id: `reply:${m.uid}`, kind: 'reply', draft: true,
          text: fr ? `${m.from} attend ta réponse depuis ${days} j : ${clip(m.summary || m.subject, 90)}` : `${m.from} has been waiting ${days} d for your reply: ${clip(m.summary || m.subject, 90)}`,
        });
      }
      for (const e of events.filter((e) => e.start - now < 3 * DAY && e.start > now)) {
        advice.push({
          id: `prepare:${e.id}`, kind: 'prepare', draft: false,
          text: fr ? `Prépare « ${e.title} » (${day(e.start)})${p.progress ? ` : ${clip(p.progress, 70)}` : ''}` : `Get ready for "${e.title}" (${day(e.start)})${p.progress ? `: ${clip(p.progress, 70)}` : ''}`,
        });
      }
      // l'activité : un mail, une info, une modification, ou ce qu'il t'a vu faire sur ce projet
      const last = Math.max(p.createdAt, p.updatedAt, p.seenAt, p.notes[0]?.at ?? 0, mails[0]?.date ?? 0);
      if (now - last > 10 * DAY) {
        const days = Math.round((now - last) / DAY);
        const who = mails[0]?.from;
        advice.push({
          id: `quiet:${Math.floor(now / (7 * DAY))}`, kind: 'quiet', draft: Boolean(who),
          text: fr ? `Rien de neuf depuis ${days} jours${who ? ` : relancer ${who} ?` : ' : où en est-on ?'}` : `Nothing new for ${days} days${who ? `: follow up with ${who}?` : ': where do things stand?'}`,
        });
      }
    }
    const total = p.todos.length;
    return {
      project: p,
      percent: total ? Math.round((p.todos.filter((t) => t.done).length / total) * 100) : -1,
      advice: advice.filter((a) => !this.dismissed[a.id]),
      events: events.map((e) => ({ when: e.allDay ? day(e.start) : `${day(e.start)} ${new Date(e.start).toLocaleTimeString(fr ? 'fr-FR' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}`, title: e.title })),
      mails: mails.slice(0, 3).map((m) => ({ from: m.from, summary: clip(m.summary || m.subject, 110), when: day(m.date) })),
      time: (() => {
        const all = Object.entries(p.minutes ?? {});
        const since = today(now - 6 * DAY);
        return { week: all.filter(([k]) => k >= since).reduce((a, [, v]) => a + v, 0), total: all.reduce((a, [, v]) => a + v, 0) };
      })(),
    };
  }

  views(src: Sources) {
    return this.projects.map((p) => this.view(p, src));
  }

  /** Le mail concerné par une recommandation, pour en rédiger la réponse */
  mailFor(adviceId: string, p: Project, src: Sources) {
    if (adviceId.startsWith('reply:')) return src.mails.find((m) => m.uid === Number(adviceId.slice(6))) ?? null;
    if (adviceId.startsWith('quiet:')) return src.mails.filter((m) => m.importance !== 'bruit' && mentions(p, `${m.from} ${m.fromAddress} ${m.subject} ${m.summary}`)).sort((a, b) => b.date - a.date)[0] ?? null;
    return null;
  }
}
