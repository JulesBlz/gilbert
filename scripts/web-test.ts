// Teste, avec le vrai modèle : la décision de chercher sur internet (quand oui, quand non), la
// recherche elle-même (DuckDuckGo, Wikipédia en secours), la réponse appuyée sur les résultats, et la
// relecture d'une faute avant de la signaler (une vraie faute, un faux positif de lecture, un mot rare).
//   npm run test:web

import { app } from 'electron';
import { mkdtempSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/main/brain/brain';
import { confirmTypo } from '../src/main/brain/detect';
import { explicitSearch, looksLikeLookup, siteOf, webContext, webQuery, webSearch } from '../src/main/web';
import { EMPTY_MEMORY } from '../src/shared/types';

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

  console.log('\n== faut-il chercher ? (attendu entre parenthèses) ==');
  const cases: [string, boolean][] = [
    ['Qui a gagné le match de la Ligue 1 hier soir ?', true],
    ['Quel temps fera-t-il à Lyon demain ?', true],
    ['À quelle heure ferme le musée d’Orsay le jeudi ?', true],
    ['Comment ça va aujourd’hui ?', false],
    ['Explique-moi ce qu’est une dérivée ?', false],
    ['Tu penses que je devrais changer de travail ?', false],
    ['Quand est mon prochain rendez-vous ?', false],
  ];
  let good = 0;
  for (const [q, want] of cases) {
    const gate = looksLikeLookup(q);
    const query = gate ? await webQuery(brain, q) : null;
    const got = Boolean(query);
    if (got === want) good++;
    console.log(`  ${got === want ? 'ok ' : 'KO '} ${q}  → ${query ?? 'non'}`);
  }
  console.log(`  ${good}/${cases.length}`);
  console.log('  explicite :', explicitSearch('Gilbert, cherche sur internet les horaires du musée d’Orsay'), '|', explicitSearch('Raconte-moi une blague'));

  console.log('\n== recherche + réponse ==');
  for (const q of ['À quelle heure ouvre le musée d’Orsay ?', 'Qui est le président du Vietnam ?']) {
    const t0 = Date.now();
    const results = await webSearch(q, 'fr', 5);
    console.log(`  « ${q} » : ${results.length} résultats (${((Date.now() - t0) / 1000).toFixed(1)} s) : ${[...new Set(results.map((r) => siteOf(r.url)))].join(', ')}`);
    if (results.length) console.log('  →', (await brain.ask(1, webContext(results, q, 'fr'), () => {}, { long: false })).replace(/\n+/g, ' '));
  }

  console.log('\n== relecture des fautes (vrai / faux) ==');
  const typos: [string, string, boolean][] = [
    ['Salut Paul, je sui désolé pour le retard, je t’envoie le devis demain.', 'je sui désolé', true],
    ['Salut Paul, je suis désolé pour le retard, je t’envoie le devis demain.', 'je suis désolé', false],
    ['On se retrouve sur lnstagram pour la suite ?', 'lnstagram', false],
    ['Je viens de finir le refactoring du composant avant le standup.', 'refactoring', false],
    ['Il faut que je finis mon rapport avant ce soir.', 'que je finis', true],
  ];
  let ok = 0;
  for (const [text, quote, want] of typos) {
    const r = await confirmTypo(brain, text, quote, 'fr');
    const got = Boolean(r?.faute);
    if (got === want) ok++;
    console.log(`  ${got === want ? 'ok ' : 'KO '} « ${quote} » → faute=${got}${r?.correction ? ` (${r.correction})` : ''}`);
  }
  console.log(`  ${ok}/${typos.length}`);
  await brain.dispose();
  app.quit();
}
