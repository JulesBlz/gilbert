// Teste la vision de bout en bout, sans toucher à ton écran : de fausses fenêtres sont dessinées
// hors écran, lues par l'OCR du système, puis passées au vrai modèle.
//   npm run test:vision

import { app, BrowserWindow } from 'electron';
import { mkdtempSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/main/brain/brain';
import { detectProblem, worthSaying } from '../src/main/brain/detect';
import { frontWindow, ocr, permission } from '../src/main/vision/capture';
import { EMPTY_MEMORY } from '../src/shared/types';

const real = path.join(app.getPath('appData'), 'gilbert');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gilbert-test-'));
symlinkSync(path.join(real, 'models'), path.join(tmp, 'models'));
app.setPath('userData', tmp);
app.dock?.hide();
// les fausses fenêtres se ferment une à une : l'appli ne doit pas quitter pour autant
app.on('window-all-closed', () => {});

app.whenReady().then(run).catch((err) => { console.error('échec :', err); app.quit(); });

const page = (body: string, mono = false) => `<html><body style="margin:0;padding:28px;background:#fff;color:#202124;font:${mono ? '15px Menlo, monospace' : '16px -apple-system, Helvetica, sans-serif'};line-height:1.5">${body}</body></html>`;
const mail = (to: string, subject: string, text: string, attachment = '') => page(`
  <div style="color:#5f6368;font-size:13px">Nouveau message</div>
  <div style="border-bottom:1px solid #ddd;padding:6px 0">À &nbsp; ${to}</div>
  <div style="border-bottom:1px solid #ddd;padding:6px 0">Objet &nbsp; ${subject}</div>
  <div style="padding:14px 0;white-space:pre-line">${text}</div>
  ${attachment ? `<div style="display:inline-block;border:1px solid #ccc;border-radius:6px;padding:6px 10px">📎 ${attachment}</div>` : ''}
  <div style="margin-top:18px"><span style="background:#0b57d0;color:#fff;border-radius:16px;padding:8px 20px">Envoyer</span></div>`);

const CASES: { label: string; app: string; title: string; expect: string; html: string }[] = [
  {
    label: 'mail « ci-joint » sans pièce jointe', app: 'Google Chrome', title: 'Nouveau message - Gmail', expect: 'oubli',
    html: mail('paul@agence-ronde.fr', 'Devis refonte du site', 'Bonjour Paul,\n\nComme convenu, ci-joint le devis pour la refonte du site.\nJe reste disponible jeudi 29 octobre pour en parler.\n\nBonne journée,\nJules'),
  },
  {
    label: 'le même, avec la pièce jointe', app: 'Google Chrome', title: 'Nouveau message - Gmail', expect: 'aucun',
    html: mail('paul@agence-ronde.fr', 'Devis refonte du site', 'Bonjour Paul,\n\nComme convenu, ci-joint le devis pour la refonte du site.\nJe reste disponible jeudi 29 octobre pour en parler.\n\nBonne journée,\nJules', 'Devis-refonte-Agence-Ronde.pdf'),
  },
  {
    label: 'mauvais jour de la semaine', app: 'Mail', title: 'Rendez-vous', expect: 'incoherence',
    html: mail('camille.b@gmail.com', 'Rendez-vous', 'Salut Camille,\n\nOn se voit lundi 29 octobre à 19 h chez toi ?\n\nBises'),
  },
  {
    label: 'fautes de frappe', app: 'Messages', title: 'Camille', expect: 'faute',
    html: mail('camille.b@gmail.com', 'Samedi', "Coucou,\n\nJe serai la samedi pour l'anniverssaire de maman, je m'ocupe du gâteu.\n\nÀ samedi !"),
  },
  {
    label: 'erreur de compilation', app: 'Terminal', title: 'gilbert — zsh', expect: 'erreur',
    html: page(`<pre style="margin:0">jules@mac gilbert % npm run build

> gilbert@0.1.0 build
> tsc &amp;&amp; node scripts/build.mjs

src/main/brief.ts:42:7 - error TS2322: Type 'string' is not assignable to type 'number'.

42   min: weather.min.toFixed(0),
         ~~~

Found 1 error in src/main/brief.ts:42

jules@mac gilbert % </pre>`, true),
  },
  {
    label: 'article sans erreur', app: 'Safari', title: 'Le raton laveur — Wikipédia', expect: 'aucun',
    html: page(`<h1 style="font-family:Georgia;font-weight:normal">Raton laveur</h1>
      <p>Le raton laveur (Procyon lotor) est un mammifère omnivore originaire d'Amérique du Nord. Il mesure de 40 à 70 cm et pèse de 5 à 26 kg.</p>
      <p>Son pelage gris et son masque noir autour des yeux le rendent facilement reconnaissable. Il est réputé pour son intelligence et sa dextérité.</p>
      <p>Il vit en général près des cours d'eau et dans les forêts, mais s'adapte très bien aux villes.</p>`),
  },
];

async function shot(html: string) {
  const w = new BrowserWindow({ show: false, width: 1000, height: 640, webPreferences: { offscreen: true } });
  await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((r) => setTimeout(r, 400));
  // hors écran, capturePage() ne répond pas : on prend l'image de la prochaine peinture
  const img = await new Promise<Electron.NativeImage>((resolve) => {
    w.webContents.once('paint', (_e, _dirty, image) => resolve(image));
    w.webContents.invalidate();
  });
  w.destroy();
  return img.toPNG();
}

async function run() {
  console.log('permission écran :', permission());
  console.log('premier plan :', JSON.stringify(await frontWindow()));

  const texts: string[] = [];
  for (const c of CASES) {
    const t0 = Date.now();
    const lines = await ocr(await shot(c.html));
    texts.push(lines.join('\n'));
    console.log(`\nOCR [${c.label}] ${lines.length} lignes en ${Date.now() - t0} ms :\n  ${lines.join(' ⏎ ')}`);
  }

  const brain = new Brain({ lang: 'fr', humor: 'normal' }, EMPTY_MEMORY);
  await brain.start();
  console.log('\ncerveau :', brain.status.state);
  let ok = 0;
  for (const [i, c] of CASES.entries()) {
    const t0 = Date.now();
    const d = await detectProblem(brain, { app: c.app, title: c.title, text: texts[i] }, 'fr');
    const said = d && worthSaying(d, texts[i]);
    const pass = (c.expect === 'aucun') === !said && (!said || d!.problem === c.expect || c.expect !== 'aucun');
    if (pass) ok++;
    console.log(`\n[${c.label}] attendu ${c.expect} → ${d?.problem} (${d?.sure ? 'certain' : 'pas sûr'}) ${said ? 'DIT' : 'tu'} ${pass ? '✓' : '✗'}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    if (d) console.log(`  extrait : ${d.quote}\n  remarque : ${d.remark}\n  vanne : ${d.quip}`);
  }
  console.log(`\n${ok}/${CASES.length} comme attendu`);
  await brain.dispose();
  app.quit();
}
