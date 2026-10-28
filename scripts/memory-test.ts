// Teste la mémoire avec le vrai modèle, dans un dossier temporaire (ta vraie mémoire n'est pas touchée).
//   npm run test:memory

import { app } from 'electron';
import { mkdtempSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MemoryStore } from '../src/main/memory';
import { Brain } from '../src/main/brain/brain';
import { learn } from '../src/main/brain/knowledge';

// le dossier de l'appli Gilbert (lancé hors de l'appli, Electron en choisirait un autre)
const real = path.join(app.getPath('appData'), 'gilbert');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gilbert-test-'));
symlinkSync(path.join(real, 'models'), path.join(tmp, 'models'));
app.setPath('userData', tmp);
app.dock?.hide();

app.whenReady().then(run).catch((err) => { console.error('échec :', err); app.quit(); });

async function run() {
  const memory = new MemoryStore();
  memory.setProfile({ name: 'Jules', city: 'Lyon' });
  memory.addPeople([{ name: 'Camille', relation: 'sœur', birthday: '03/07' }]);
  memory.addFacts(['Prépare un voyage au Vietnam'], 'conversation');
  const brain = new Brain({ lang: 'fr', humor: 'normal' }, memory.data);
  memory.on('change', (m) => brain.setMemory(m));
  await brain.start();
  console.log('cerveau :', brain.status.state);

  const questions = [
    'Salut, ça va ?',
    'Raconte-moi une blague.',
    'Je déteste les réunions le lundi matin, ça me tue',
    'Tu te souviens quand est l’anniversaire de ma sœur ?',
  ];
  for (const q of questions) {
    const answer = await brain.ask(1, q, () => {});
    console.log(`\n> ${q}\n${answer}`);
    console.log('appris :', JSON.stringify(await learn(brain, memory, q, answer, 'fr')));
  }
  await brain.dispose();
  app.quit();
}
