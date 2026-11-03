// Les discussions longues (l'onglet Discussion) : plusieurs conversations, gardées dans chats.json, sur la machine.

import { app } from 'electron';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ChatMessage, ChatSummary, ChatThread } from '../shared/types';

const file = () => path.join(app.getPath('userData'), 'chats.json');
const KEEP = 60;

export class ChatStore {
  private threads: ChatThread[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    try {
      const saved = JSON.parse(readFileSync(file(), 'utf8')) as ChatThread[];
      if (Array.isArray(saved)) this.threads = saved.filter((t) => t && typeof t.id === 'string' && Array.isArray(t.messages));
    } catch { /* premier lancement */ }
  }

  list(): ChatSummary[] {
    return [...this.threads]
      .sort((a, b) => b.updated - a.updated)
      .map((t) => ({ id: t.id, title: t.title, updated: t.updated, count: t.messages.length }));
  }

  get(id: string): ChatThread | null {
    return this.threads.find((t) => t.id === id) ?? null;
  }

  create(): ChatThread {
    const t: ChatThread = { id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: '', updated: Date.now(), messages: [] };
    this.threads.push(t);
    this.save();
    return t;
  }

  append(id: string, m: ChatMessage) {
    const t = this.get(id);
    if (!t) return;
    t.messages.push(m);
    t.updated = Date.now();
    // le titre : le début de la première question
    if (!t.title && m.role === 'user') t.title = m.text.replace(/\s+/g, ' ').trim().slice(0, 42) + (m.text.length > 42 ? '…' : '');
    this.save();
  }

  remove(id: string) {
    this.threads = this.threads.filter((t) => t.id !== id);
    this.save();
  }

  private save() {
    // les plus anciennes conversations s'effacent au-delà de 60
    if (this.threads.length > KEEP) this.threads = [...this.threads].sort((a, b) => b.updated - a.updated).slice(0, KEEP);
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        mkdirSync(path.dirname(file()), { recursive: true });
        const tmp = `${file()}.tmp`;
        writeFileSync(tmp, JSON.stringify(this.threads));
        renameSync(tmp, file());
      } catch { /* pas grave : au prochain changement */ }
    }, 400);
  }
}
