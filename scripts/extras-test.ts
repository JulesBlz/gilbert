// Teste, avec le vrai modèle et dans un dossier temporaire : la note du soir et le résumé de la
// semaine du carnet de bord, l'aide sur ce qu'on copie (traduire, corriger, expliquer, résumer), et
// l'anniversaire préparé (idée de cadeau, petit message). Le presse-papiers n'est jamais touché.
//   npm run test:extras

import { app, clipboard } from 'electron';
import { mkdtempSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/main/brain/brain';
import { isoDay, Journal, weekOf, writeDayNote, writeWeek } from '../src/main/journal';
import { ClipboardHelper } from '../src/main/clipboard';
import { EMPTY_MEMORY, SPEAK, type Command } from '../src/shared/types';

const real = path.join(app.getPath('appData'), 'gilbert');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gilbert-test-'));
symlinkSync(path.join(real, 'models'), path.join(tmp, 'models'));
app.setPath('userData', tmp);
app.dock?.hide();

app.whenReady().then(run).catch((err) => { console.error('échec :', err); app.quit(); });

async function run() {
  const brain = new Brain({ lang: 'fr', humor: 'normal' }, EMPTY_MEMORY);
  await brain.start();
  console.log('cerveau :', brain.status.state);

  // ----- carnet de bord : une semaine inventée -----
  const j = new Journal();
  const monday = weekOf(new Date());
  const apps = [{ 'Visual Studio Code': 190, 'Google Chrome': 95, Slack: 40, Figma: 25 }, { 'Visual Studio Code': 120, Mail: 50, 'Google Chrome': 140, Spotify: 20 }, { Figma: 160, 'Google Chrome': 60, Slack: 55 }];
  apps.forEach((a, i) => {
    const d = new Date(`${monday}T12:00`);
    d.setDate(d.getDate() + i);
    j.data.days[isoDay(d)] = { apps: a, focus: { sessions: 3 - i, minutes: (3 - i) * 25 + 10 * i, stopped: i % 2 }, done: i === 0 ? ['Rendre le devis à Paul', 'appeler la banque'] : i === 2 ? ['Envoyer la facture'] : [], mails: 4 + i, chats: 6, note: '' };
  });
  const first = isoDay(new Date(`${monday}T12:00`));
  let t0 = Date.now();
  const note = await writeDayNote(brain, j, first, 'fr');
  console.log(`\n== note du soir (${((Date.now() - t0) / 1000).toFixed(1)} s) ==\n${note}`);
  j.setNote(first, note);
  t0 = Date.now();
  const week = await writeWeek(brain, j, monday, 'fr');
  console.log(`\n== résumé de la semaine (${((Date.now() - t0) / 1000).toFixed(1)} s) ==`);
  for (const b of week ?? ['(rien)']) console.log(`  » ${b}`);

  // ----- presse-papiers -----
  console.log('\n== presse-papiers ==');
  const offers: string[] = [];
  const helper = new ClipboardHelper({ brain, lang: () => 'fr', allowed: () => true, send: (c: Command) => { if (c.type === 'offer' && !c.thinking) offers.push(c.text); } });
  const run = (helper as unknown as { run(h: string, t: string): Promise<void> }).run.bind(helper);
  const before = await clipboard.readText();
  const samples: [string, string][] = [
    ['translate', 'Hi Jules, could you send me the final version of the slides before Thursday noon? We present to the board on Friday morning. Thanks!'],
    ['fix', "Bonjour Paul, je te met en piece jointe le devis corigé. N'hésite pas si tu a des questions, je suis dispo demain aprés-midi."],
    ['explain', "TypeError: Cannot read properties of undefined (reading 'map')\n    at TaskList (TaskList.tsx:14:22)"],
  ];
  for (const [h, text] of samples) {
    t0 = Date.now();
    await run(h, text);
    console.log(`\n[${h}] (${((Date.now() - t0) / 1000).toFixed(1)} s)\n  bulle : ${offers.at(-1)}`);
  }
  console.log(`\npresse-papiers inchangé : ${(await clipboard.readText()) === before ? 'oui' : 'NON'}`);

  // ----- anniversaire -----
  console.log('\n== anniversaire ==');
  const idea = await brain.compose([
    `L'anniversaire de Camille (sœur) est dans 3 jours. Propose UNE idée de cadeau originale et réaliste, en une phrase de 20 mots maximum, ${SPEAK.fr}.`,
    'Ce que tu sais sur Camille : Camille adore la céramique ; Camille vient de déménager à Bordeaux.',
    'Écris seulement la phrase.',
  ].join('\n'), 80);
  console.log(`  idée : ${idea?.trim()}`);
  const msg = await brain.compose([
    "Écris un message d'anniversaire court et chaleureux pour Camille (sœur), AU NOM de ton humain (Jules) : c'est lui qui l'envoie, pas toi.",
    'Naturel, 2 ou 3 phrases, une touche personnelle si tu en sais assez, une pointe d’humour tendre. Pas de signature « Gilbert ».',
    'Ce que tu sais sur Camille : Camille adore la céramique ; Camille vient de déménager à Bordeaux.',
    'Langue : français. Écris seulement le message.',
  ].join('\n'), 160);
  console.log(`  message : ${msg?.trim()}`);

  await brain.dispose();
  app.quit();
}
