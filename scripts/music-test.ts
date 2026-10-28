// Teste la musique : ce qui joue en ce moment (sans rien changer) et les remarques de Gilbert
// sur quelques morceaux, avec le vrai modèle.
//   npm run test:music

import { app } from 'electron';
import { mkdtempSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/main/brain/brain';
import { describe, Music } from '../src/main/music';
import { EMPTY_MEMORY } from '../src/shared/types';

const real = path.join(app.getPath('appData'), 'gilbert');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gilbert-test-'));
symlinkSync(path.join(real, 'models'), path.join(tmp, 'models'));
app.setPath('userData', tmp);
app.dock?.hide();

app.whenReady().then(run).catch((err) => { console.error('échec :', err); app.quit(); });

async function run() {
  const now = await new Music().run('status');
  console.log('en ce moment :', now.player ? `${now.player}, ${now.playing ? 'lecture' : 'pause'} : ${describe(now, 'fr')}` : 'rien');

  const brain = new Brain({ lang: 'fr', humor: 'normal' }, EMPTY_MEMORY);
  await brain.start();
  const songs = [
    now.title ? now : null,
    { player: 'Spotify', playing: true, title: 'Toxic', artist: 'Britney Spears', album: 'In the Zone' },
    { player: 'Spotify', playing: true, title: 'Clair de lune', artist: 'Claude Debussy', album: 'Suite bergamasque' },
    { player: 'Spotify', playing: true, title: 'Bohemian Rhapsody', artist: 'Queen', album: 'A Night at the Opera' },
  ].filter(Boolean) as typeof now[];
  for (const t of songs) {
    const out = await brain.compose(`Ton humain vient de lancer ${describe(t, 'fr')}, de l’album « ${t.album} ». En une phrase de 15 mots maximum, fais une remarque taquine mais bienveillante sur ce choix musical. Si tu ne connais pas ce morceau, ne fais pas semblant : joue sur le titre ou le nom de l’artiste.`, 60);
    console.log(`\n${describe(t, 'fr')}\n  » ${out?.split('\n').find((l) => l.trim())?.trim()}`);
  }
  await brain.dispose();
  app.quit();
}
