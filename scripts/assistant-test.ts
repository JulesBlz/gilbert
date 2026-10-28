// Teste le tri des mails (vrai modèle) et les rappels d'échéance, dans un dossier temporaire.
//   npm run test:assistant

import { app } from 'electron';
import { mkdtempSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MemoryStore } from '../src/main/memory';
import { Brain } from '../src/main/brain/brain';
import { triageMail } from '../src/main/brain/triage';
import { TaskStore } from '../src/main/tasks';
import type { IncomingMail } from '../src/main/mail';

const real = path.join(app.getPath('appData'), 'gilbert');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gilbert-test-'));
symlinkSync(path.join(real, 'models'), path.join(tmp, 'models'));
app.setPath('userData', tmp);
app.dock?.hide();

app.whenReady().then(run).catch((err) => { console.error('échec :', err); app.quit(); });

const mail = (from: string, fromAddress: string, subject: string, text: string, bulk = false): IncomingMail =>
  ({ uid: 1, from, fromAddress, subject, text, bulk, date: Date.now() });

async function run() {
  // ----- rappels d'échéance (sans modèle) -----
  const tasks = new TaskStore();
  const d = new Date();
  d.setDate(d.getDate() + 3);
  const due = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  tasks.add({ title: 'Rendre le devis à Paul', due, time: '14:00', source: 'mail' });
  const at = (days: number, h: number) => { const x = new Date(d); x.setDate(x.getDate() + days); x.setHours(h, 0, 0, 0); return x.getTime(); };
  const steps: [string, number][] = [
    ['J-3 à 8h (trop tôt)', at(-3, 8)], ['J-3 à 10h', at(-3, 10)], ['J-3 à 11h (déjà dit)', at(-3, 11)],
    ['J-1 à 10h', at(-1, 10)], ['jour J à 9h', at(0, 9)], ['jour J à 12h30', at(0, 12.5)], ['jour J à 15h (passé)', at(0, 15)],
  ];
  for (const [label, now] of steps) console.log(`rappel ${label} →`, JSON.stringify(tasks.dueReminders(now).map((r) => r.kind)));

  // ----- tri des mails -----
  const memory = new MemoryStore();
  memory.setProfile({ name: 'Jules', job: 'développeur indépendant' });
  memory.addPeople([{ name: 'Camille', relation: 'sœur', birthday: '03/07' }]);
  const brain = new Brain({ lang: 'fr', humor: 'normal' }, memory.data);
  await brain.start();
  console.log('\ncerveau :', brain.status.state);

  const samples = [
    mail('Paul Martin', 'paul@agence-ronde.fr', 'Devis refonte site', "Bonjour Jules, comme convenu, peux-tu m'envoyer ton devis pour la refonte avant vendredi midi ? Le client valide lundi. Merci ! Paul"),
    mail('Zalando', 'newsletter@zalando.fr', '-40 % sur les manteaux ce week-end', 'Profitez de nos offres exceptionnelles sur toute la collection hiver. Livraison gratuite.', true),
    mail('Amazon', 'confirmation@amazon.fr', 'Votre commande a été expédiée', 'Votre colis contenant « Clavier mécanique » arrivera jeudi.'),
    mail('Camille', 'camille.b@gmail.com', 'samedi ?', "Coucou ! Tu viens toujours samedi pour l'anniversaire de maman ? Dis-moi vite que je réserve le resto."),
    mail('Google', 'no-reply@accounts.google.com', 'Alerte de sécurité', 'Nouvelle connexion à votre compte depuis un appareil Windows à Moscou. Si ce n’était pas vous, sécurisez votre compte.'),
  ];
  for (const m of samples) {
    const t0 = Date.now();
    const r = await triageMail(brain, memory.data, m, 'fr');
    console.log(`\n[${m.from}] ${m.subject}\n→ ${r.importance} · ${r.summary}${r.deadline ? `\n  échéance : ${r.deadline.what} le ${r.deadline.date} ${r.deadline.time}` : ''}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  await brain.dispose();
  app.quit();
}
