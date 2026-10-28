// Teste, avec le vrai modèle et dans un dossier temporaire : les rappels dictés, la mémoire des
// mails (recherche + réponse), les mails qui attendent une réponse, le brouillon, le bilan du soir,
// le rappel à l'ordre, et Gilbert en vietnamien.
//   npm run test:features

import { app } from 'electron';
import { mkdtempSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/main/brain/brain';
import { describeReminder, parseReminder, REMIND } from '../src/main/brain/remind';
import { triageMail } from '../src/main/brain/triage';
import { aboutMail, Mailbox, mailContext, mailQuery } from '../src/main/mailbox';
import { writeBrief, writeEvening, type BriefFacts } from '../src/main/brief';
import { EMPTY_MEMORY, SPEAK } from '../src/shared/types';

const real = path.join(app.getPath('appData'), 'gilbert');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gilbert-test-'));
symlinkSync(path.join(real, 'models'), path.join(tmp, 'models'));
app.setPath('userData', tmp);
app.dock?.hide();

app.whenReady().then(run).catch((err) => { console.error('échec :', err); app.quit(); });

const DAY = 86_400_000;
const mail = (uid: number, daysAgo: number, from: string, fromAddress: string, subject: string, text: string) =>
  ({ uid, date: Date.now() - daysAgo * DAY, from, fromAddress, subject, text, summary: '', importance: '' as const, needsReply: false });

async function run() {
  const brain = new Brain({ lang: 'fr', humor: 'normal' }, EMPTY_MEMORY);
  await brain.start();
  console.log('cerveau :', brain.status.state);
  const time = async <T>(f: () => Promise<T>) => { const t0 = Date.now(); const r = await f(); return [r, ((Date.now() - t0) / 1000).toFixed(1)] as const; };

  // ----- 1. rappels dictés -----
  console.log('\n== rappels ==');
  for (const [text, lang] of [
    ["Rappelle-moi d'appeler Paul demain à 10h", 'fr'],
    ['rappelle moi de sortir le linge dans 20 minutes', 'fr'],
    ['fais-moi penser à acheter du pain ce soir', 'fr'],
    ['Remind me to send the invoice on Friday', 'en'],
    ['Nhắc tớ gọi cho mẹ lúc 8 giờ tối nay', 'vi'],
    ['Tu te rappelles de mon frère ?', 'fr'],
  ] as const) {
    if (!REMIND.test(text)) { console.log(`  « ${text} » → pas un rappel (filtre)`); continue; }
    const [r, s] = await time(() => parseReminder(brain, text, lang));
    console.log(`  « ${text} » → ${r ? `${describeReminder(r, lang)} [${r.due} ${r.time}]` : 'rien'} (${s} s)`);
  }

  // ----- 2. mémoire des mails -----
  console.log('\n== mémoire des mails ==');
  const box = new Mailbox();
  box.add([
    mail(1, 9, 'Paul Martin', 'paul@agence-ronde.fr', 'Devis refonte', "Salut Jules, tu peux m'envoyer ton devis pour la refonte du site avant le 6 novembre ? Le client veut aussi une version mobile. Merci, Paul"),
    mail(2, 5, 'Camille', 'camille.b@gmail.com', 'samedi ?', "Coucou ! Tu viens samedi pour l'anniversaire de maman ? Dis-moi vite que je réserve le resto pour 8."),
    mail(3, 3, 'SNCF Connect', 'noreply@sncf.fr', 'Votre billet Lyon - Paris', 'Votre billet pour le 14 novembre, départ 07:04 de Lyon Part-Dieu, arrivée 09:00 à Paris Gare de Lyon. Voiture 12, place 54.'),
    mail(4, 2, 'Free', 'facture@free.fr', 'Votre facture Freebox', 'Votre facture du mois d’octobre est disponible : 39,99 €. Prélèvement le 5 novembre.'),
    mail(5, 1, 'Paul Martin', 'paul@agence-ronde.fr', 'Re: Devis refonte', "Petite précision : le client a un budget de 8 000 € max. Paul"),
  ]);
  for (const q of ["Qu'est-ce que Paul m'a demandé ?", 'Mon train pour Paris part à quelle heure ?', 'Combien je paie pour ma box internet ?', 'Il fait beau aujourd’hui ?']) {
    const isMail = aboutMail(q, box);
    const query = isMail ? await mailQuery(brain, q) : null;
    const found = query ? box.search(query, 3) : [];
    console.log(`\n  ${q}\n  → ${isMail ? `retrouvés : ${found.map((f) => `${f.mail.from} « ${f.mail.subject} » (${f.score.toFixed(1)})`).join(' ; ') || 'aucun'}` : 'pas une question de mails'}`);
    if (found.length) {
      const [answer, s] = await time(() => brain.ask(Math.random(), `${mailContext(found, 'fr')}\n\nSa question : ${q}`, () => {}));
      console.log(`  » ${answer.trim()} (${s} s)`);
    }
  }

  // ----- 3. attend une réponse ? -----
  console.log('\n== attend une réponse ? ==');
  for (const m of box.mails.filter((x) => [2, 3].includes(x.uid))) {
    const [tri, s] = await time(() => triageMail(brain, EMPTY_MEMORY, { ...m, bulk: false }, 'fr'));
    console.log(`  ${m.from} « ${m.subject} » → ${tri.importance}, réponse attendue : ${tri.needsReply} (${s} s)`);
  }

  // ----- 4. brouillon -----
  console.log('\n== brouillon pour Camille ==');
  const camille = box.mails.find((x) => x.uid === 2)!;
  const [draft, ds] = await time(() => brain.compose([
    "Rédige une réponse au mail ci-dessous, AU NOM de ton humain (Jules) : c'est lui qui écrit et qui signe, pas toi.",
    'Courte, naturelle, polie, dans le ton du mail reçu (tutoiement si on le tutoie). Pas d’objet, pas de formule « Gilbert ».',
    'Si une information te manque (une date, un prix…), laisse-la entre crochets, par exemple [date].',
    'Langue : celle du mail reçu. Écris uniquement la réponse.', '',
    `De : ${camille.from} <${camille.fromAddress}>`, `Objet : ${camille.subject}`, `Texte : ${camille.text}`,
  ].join('\n'), 300));
  console.log(`${draft?.trim()}\n  (${ds} s)`);

  // ----- 5. bilan du soir -----
  console.log('\n== bilan du soir ==');
  const [ev, es] = await time(() => writeEvening(brain, {
    done: ['Rendre le devis à Paul', 'appeler la banque'],
    left: ['sortir le linge (21:00)'],
    tomorrow: ['09:30 Dentiste', 'échéance « Envoyer la facture » 12:00'],
    waiting: ['Camille'],
  }, 'fr'));
  for (const b of ev ?? ['(rien)']) console.log(`  » ${b}`);
  console.log(`  (${es} s)`);

  // ----- 6. rappel à l'ordre -----
  console.log('\n== rappel à l’ordre ==');
  for (const tone of ['Reste léger et bienveillant.', 'Tu l’as déjà prévenu : sois plus direct, toujours drôle.']) {
    const out = await brain.compose([
      'Ça fait 12 minutes que ton humain est sur YouTube, alors qu’il a « Rendre le devis à Paul » dans 1 h 40.',
      `En une phrase de 20 mots maximum, ${SPEAK.fr}, rappelle-le à l'ordre avec humour, sans faire la morale. ${tone}`,
    ].join('\n'), 70);
    console.log(`  » ${out?.trim()}`);
  }

  // ----- 7. en vietnamien -----
  console.log('\n== tiếng Việt ==');
  brain.setPersona({ lang: 'vi', humor: 'normal' });
  for (const q of ['Chào Gilbert! Hôm nay cậu thế nào?', 'Kể cho tớ một câu chuyện cười ngắn đi.']) {
    const [a, s] = await time(() => brain.ask(Math.random(), q, () => {}));
    console.log(`  ${q}\n  » ${a.trim()} (${s} s)`);
  }
  const facts: BriefFacts = {
    now: new Date(new Date().setHours(8, 30)), name: 'Jules',
    weather: { place: 'Hà Nội', sky: 'a few clouds', min: 22, max: 29, rain: 20 },
    calendar: true, events: [{ id: '1', title: 'Họp với khách hàng', start: new Date().setHours(10, 0), end: new Date().setHours(11, 0), allDay: false, location: '' }],
    tasks: [], mail: true, mails: [{ from: 'Paul Martin', summary: 'Paul attend ton devis avant midi' }], backlog: 0, birthdays: [],
  };
  const [vb, vs] = await time(() => writeBrief(brain, facts, 'vi'));
  console.log(`  bản tin (${vs} s) :`);
  for (const b of vb ?? ['(rien)']) console.log(`  » ${b}`);

  await brain.dispose();
  app.quit();
}
