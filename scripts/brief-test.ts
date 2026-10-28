// Teste le brief du jour : vraie météo (Open-Meteo) et vrai modèle, sur une journée chargée
// et une journée vide ; puis le récap d'absence. Dans un dossier temporaire.
//   npm run test:brief

import { app } from 'electron';
import { mkdtempSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MemoryStore } from '../src/main/memory';
import { Brain } from '../src/main/brain/brain';
import { BriefStore, birthdays, plainBrief, plainRecap, writeBrief, writeRecap, type BriefFacts } from '../src/main/brief';
import type { CalendarEvent, Task } from '../src/shared/types';

const real = path.join(app.getPath('appData'), 'gilbert');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gilbert-test-'));
symlinkSync(path.join(real, 'models'), path.join(tmp, 'models'));
app.setPath('userData', tmp);
app.dock?.hide();

app.whenReady().then(run).catch((err) => { console.error('échec :', err); app.quit(); });

const at = (h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const event = (title: string, h: number, m = 0, location = ''): CalendarEvent => ({ id: title, title, start: at(h, m), end: at(h + 1, m), allDay: false, location });
const task = (title: string, time = ''): Task => ({ id: title, title, due: today(), time, source: 'carnet', done: false, reminded: [], createdAt: 0 });

async function run() {
  const store = new BriefStore();
  console.log('brief à faire :', store.due());
  const weather = await store.weather('Lyon', 'fr');
  console.log('météo :', weather);

  const memory = new MemoryStore();
  memory.setProfile({ name: 'Jules', job: 'développeur indépendant', city: 'Lyon' });
  const d = new Date();
  memory.addPeople([{ name: 'Camille', relation: 'sœur', birthday: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` }]);

  const busy: BriefFacts = {
    now: new Date(new Date().setHours(8, 40)),
    name: 'Jules',
    weather,
    calendar: true,
    events: [event('Point client Agence Ronde', 10, 0, 'Visio'), event('Dentiste', 14, 30, 'Rue Mercière')],
    tasks: [task('Rendre le devis à Paul', '12:00')],
    mail: true,
    mails: [{ from: 'Paul Martin', summary: 'Paul te demande ton devis pour la refonte avant midi' }],
    backlog: 0,
    birthdays: birthdays(memory.data),
  };
  const empty: BriefFacts = { ...busy, now: new Date(new Date().setHours(15, 10)), events: [], tasks: [], mails: [], birthdays: [], weather: null };

  console.log('\nsans cerveau :', plainBrief(busy, 'fr'));

  const brain = new Brain({ lang: 'fr', humor: 'normal' }, memory.data);
  await brain.start();
  console.log('cerveau :', brain.status.state);
  for (const [label, f, lang] of [['journée chargée', busy, 'fr'], ['journée vide, l’après-midi', empty, 'fr'], ['busy day (en)', busy, 'en']] as const) {
    if (lang === 'en') brain.setPersona({ lang: 'en', humor: 'normal' });
    for (let i = 0; i < 2; i++) {
      const t0 = Date.now();
      const out = await writeBrief(brain, f, lang);
      console.log(`\n[${label}] (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
      for (const b of out ?? ['(rien)']) console.log(`  » ${b}`);
    }
  }
  // récap d'absence (et de mode Chut)
  brain.setPersona({ lang: 'fr', humor: 'normal' });
  const facts = [
    '(14:02) Mail important de Paul Martin : Paul te demande ton devis pour la refonte avant 18 h',
    '(14:20) Rendez-vous « Point client Agence Ronde » à 14:30 (Visio)',
    '(14:41) Mail important de Camille : Camille te demande si tu viens samedi',
    '(15:00) Échéance « Rendre le devis à Paul » : mercredi 28 octobre à 17:00',
  ];
  console.log('\nrécap sans cerveau :', plainRecap(facts, 'away', 'fr'));
  for (const why of ['away', 'quiet'] as const) {
    const t0 = Date.now();
    const out = await writeRecap(brain, facts, why, Date.now() - 75 * 60_000, 'fr');
    console.log(`\n[récap ${why}] (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    for (const b of out ?? ['(rien)']) console.log(`  » ${b}`);
  }
  await brain.dispose();
  app.quit();
}
