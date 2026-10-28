// La mémoire de Gilbert : ce qu'il sait de son humain. Un simple fichier JSON local
// (memory.json dans le dossier de l'appli), propre à chaque installation ; rien ne quitte la machine.

import { app } from 'electron';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { EMPTY_MEMORY, type Fact, type Memory, type Person, type Profile } from '../shared/types';

const MAX_FACTS = 200;

const file = () => path.join(app.getPath('userData'), 'memory.json');

/** Comparaison tolérante pour éviter les doublons (« Tu aimes le café. » ≈ « tu aimes le cafe ») */
const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

export class MemoryStore extends EventEmitter {
  data: Memory;

  constructor() {
    super();
    this.data = this.load();
  }

  private load(): Memory {
    try {
      const saved = JSON.parse(readFileSync(file(), 'utf8'));
      return {
        ...EMPTY_MEMORY,
        ...saved,
        profile: { ...EMPTY_MEMORY.profile, ...saved.profile },
      };
    } catch {
      return structuredClone(EMPTY_MEMORY);
    }
  }

  private commit() {
    mkdirSync(path.dirname(file()), { recursive: true });
    // écriture atomique : un fichier temporaire, puis renommage
    const tmp = `${file()}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, file());
    this.emit('change', this.data);
  }

  /** Remplace tout (depuis le carnet), en nettoyant les entrées vides */
  replace(m: Memory) {
    const clean = (s: unknown) => (typeof s === 'string' ? s.trim().slice(0, 500) : '');
    this.data = {
      onboarded: Boolean(m.onboarded),
      profile: Object.fromEntries(
        Object.keys(EMPTY_MEMORY.profile).map((k) => [k, clean(m.profile?.[k as keyof Profile])]),
      ) as unknown as Profile,
      people: (m.people ?? [])
        .map((p) => ({ id: p.id || randomUUID(), name: clean(p.name), relation: clean(p.relation), birthday: clean(p.birthday) }))
        .filter((p) => p.name),
      facts: (m.facts ?? [])
        .map((f) => ({ ...f, id: f.id || randomUUID(), text: clean(f.text), createdAt: f.createdAt || Date.now() }))
        .filter((f) => f.text),
    };
    this.commit();
  }

  setProfile(patch: Partial<Profile>) {
    this.data.profile = { ...this.data.profile, ...patch };
    this.commit();
  }

  /** Les premières questions sont finies (ou refusées) : on ne les repose plus */
  finishOnboarding(patch: Partial<Profile> = {}) {
    const clean = Object.fromEntries(Object.entries(patch).filter(([k, v]) => k in EMPTY_MEMORY.profile && typeof v === 'string' && v.trim()).map(([k, v]) => [k, (v as string).trim().slice(0, 200)]));
    this.data.profile = { ...this.data.profile, ...clean };
    this.data.onboarded = true;
    this.commit();
  }

  /** Ajoute des souvenirs ; renvoie ceux qui étaient vraiment nouveaux */
  addFacts(texts: string[], source: Fact['source']): string[] {
    const known = new Set(this.data.facts.map((f) => normalize(f.text)));
    const added: string[] = [];
    for (const t of texts.map((x) => x.trim()).filter(Boolean)) {
      const key = normalize(t);
      if (!key || known.has(key)) continue;
      known.add(key);
      this.data.facts.push({ id: randomUUID(), text: t, source, createdAt: Date.now() });
      added.push(t);
    }
    // au-delà de la limite, on oublie les plus anciens souvenirs appris en discutant
    while (this.data.facts.length > MAX_FACTS) {
      const i = this.data.facts.findIndex((f) => f.source === 'conversation');
      this.data.facts.splice(i >= 0 ? i : 0, 1);
    }
    if (added.length) this.commit();
    return added;
  }

  addPeople(people: Omit<Person, 'id'>[]) {
    const known = new Set(this.data.people.map((p) => normalize(p.name)));
    for (const p of people) {
      if (!p.name.trim() || known.has(normalize(p.name))) continue;
      this.data.people.push({ id: randomUUID(), ...p });
    }
    this.commit();
  }

  forgetAll() {
    this.data = structuredClone(EMPTY_MEMORY);
    this.commit();
  }
}
