// Ta liste de choses à faire, rangée dans tasks.json :
// - les échéances (datées, venues d'un mail ou de la liste) : rappelées à J-3, J-1, le jour même et 2 h avant ;
// - les rappels demandés dans la discussion (« rappelle-moi… ») : à l'heure dite, ou à 9 h ;
// - les tâches sans date (« ajoute … à ma liste ») : pas de rappel, juste la liste.

import { app } from 'electron';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Task } from '../shared/types';

const file = () => path.join(app.getPath('userData'), 'tasks.json');
const HOUR = 3_600_000, DAY = 24 * HOUR;

/** Minuit (heure locale) du jour AAAA-MM-JJ */
const dayStart = (due: string) => {
  const [y, m, d] = due.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};

export class TaskStore extends EventEmitter {
  tasks: Task[];

  constructor() {
    super();
    try {
      this.tasks = JSON.parse(readFileSync(file(), 'utf8'));
    } catch {
      this.tasks = [];
    }
  }

  private commit() {
    mkdirSync(path.dirname(file()), { recursive: true });
    const tmp = `${file()}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.tasks, null, 2));
    renameSync(tmp, file());
    this.emit('change', this.tasks);
  }

  add(t: Pick<Task, 'title' | 'due' | 'time' | 'source' | 'parent'>) {
    const task: Task = { ...t, id: randomUUID(), done: false, reminded: [], createdAt: Date.now() };
    this.tasks.push(task);
    this.sort();
    this.commit();
    return task;
  }

  private sort() {
    // les datées d'abord, par date ; les autres ensuite, dans l'ordre où tu les as ajoutées
    this.tasks.sort((a, b) => (a.due ? a.due + a.time : '~').localeCompare(b.due ? b.due + b.time : '~') || a.createdAt - b.createdAt);
  }

  /** Changée depuis la liste (titre, date : les rappels repartent de zéro) */
  edit(id: string, patch: { title?: string; due?: string }) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    if (patch.title?.trim()) t.title = patch.title.trim().slice(0, 200);
    if (patch.due !== undefined && (patch.due === '' || /^\d{4}-\d{2}-\d{2}$/.test(patch.due))) {
      t.due = patch.due;
      if (!t.due) t.time = '';
      t.reminded = [];
    }
    this.sort();
    this.commit();
  }

  /** Retirée, avec ses étapes */
  remove(id: string) {
    this.tasks = this.tasks.filter((x) => x.id !== id && x.parent !== id);
    this.commit();
  }

  /** Les étapes d'une tâche découpée */
  steps(id: string) {
    return this.tasks.filter((x) => x.parent === id);
  }

  /** Décochée : pas faite, finalement */
  reopen(id: string) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    t.done = false;
    t.doneAt = undefined;
    this.commit();
  }

  /** La tâche ouverte dont le titre ressemble le plus à `text` (« c'est fait : le devis ») */
  find(text: string) {
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ');
    const words = norm(text).split(/\s+/).filter((w) => w.length > 2);
    let best: Task | null = null, score = 0;
    for (const t of this.tasks.filter((x) => !x.done)) {
      const title = norm(t.title);
      const s = words.filter((w) => title.includes(w)).length / Math.max(words.length, 1);
      if (s > score) { best = t; score = s; }
    }
    return score >= 0.5 ? best : null;
  }

  /** Marquée faite (case cochée, bouton « Fait » d'un rappel) */
  done(id: string) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    t.done = true;
    t.doneAt = Date.now();
    this.commit();
    this.emit('done', t);
  }

  /** Repoussée de quelques minutes (bouton « Dans 10 min ») */
  snooze(id: string, minutes: number) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    const at = new Date(Date.now() + minutes * 60_000);
    t.due = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
    t.time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    t.reminded = [];
    this.commit();
  }

  /** Faites aujourd'hui */
  doneToday(now = Date.now()) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return this.tasks.filter((t) => t.done && (t.doneAt ?? 0) >= start.getTime());
  }

  /** Échéances à venir (pas faites, pas dépassées) */
  upcoming(now = Date.now(), days = 7) {
    return this.tasks.filter((t) => !t.done && t.due && dayStart(t.due) + DAY > now && dayStart(t.due) < now + days * DAY);
  }

  /**
   * Rappels dus maintenant. Seul le plus récent compte : une échéance ajoutée la veille
   * n'a pas de rappel « J-3 » en retard.
   */
  dueReminders(now = Date.now()) {
    const out: { task: Task; kind: string }[] = [];
    let changed = false;
    for (const t of this.tasks) {
      if (t.done || !t.due) continue;
      const start = dayStart(t.due);
      // un rappel ou une échéance de mail passés depuis plus d'un jour : on les range. Ce que tu as
      // mis toi-même dans ta liste reste « en retard » tant que tu ne l'as pas coché.
      if (now > start + 2 * DAY) {
        if (t.source === 'chat' || t.source === 'mail') { t.done = true; changed = true; }
        continue;
      }
      const at = t.time ? start + Number(t.time.slice(0, 2)) * HOUR + Number(t.time.slice(3)) * 60_000 : null;
      if (t.source === 'chat') {
        // un rappel : à l'heure dite (dans l'heure qui suit, s'il était absent), sinon à 9 h
        const [kind, when] = at ? ['now', at] : ['jour', start + 9 * HOUR];
        if (now >= when && now < when + (at ? HOUR : 15 * HOUR) && !t.reminded.includes(kind)) {
          t.reminded.push(kind);
          changed = true;
          out.push({ task: t, kind });
        }
        continue;
      }
      const steps: [string, number][] = [
        ['j-3', start - 3 * DAY + 9 * HOUR],
        ['j-1', start - DAY + 9 * HOUR],
        ['jour', start + 8.5 * HOUR],
      ];
      if (at) steps.push(['h-2', at - 2 * HOUR]);
      const reached = steps.filter(([, when]) => now >= when && (!at || now < at) && now < start + DAY);
      const last = reached[reached.length - 1];
      if (!last) continue;
      const fresh = !t.reminded.includes(last[0]);
      for (const [k] of reached) if (!t.reminded.includes(k)) { t.reminded.push(k); changed = true; }
      if (fresh) out.push({ task: t, kind: last[0] });
    }
    if (changed) this.commit();
    return out;
  }
}
