// Vérifie la lecture d'un agenda privé (identifiant + mot de passe) sur un petit serveur local.
//   node scripts/calendar-auth-test.ts
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { Calendar, normalizeUrl } from '../src/main/calendar.ts';

const ics = readFileSync(new URL('./fixtures/agenda.ics', import.meta.url), 'utf8');
const expected = `Basic ${Buffer.from('jules:secret').toString('base64')}`;
const server = createServer((req, res) => {
  if (req.headers.authorization !== expected) return res.writeHead(401, { 'WWW-Authenticate': 'Basic' }).end();
  res.writeHead(200, { 'Content-Type': 'text/calendar' }).end(ics);
}).listen(0, async () => {
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/agenda.ics`;
  for (const [label, auth] of [['sans identifiants', null], ['mauvais mot de passe', { user: 'jules', password: 'nope' }], ['bons identifiants', { user: 'jules', password: 'secret' }]] as const) {
    const cal = new Calendar();
    try {
      await cal.use(url, auth);
      console.log(`${label} → lu (${cal.status.state})`);
    } catch (err) {
      console.log(`${label} → ${(err as Error).message}`);
    }
    cal.stop();
  }
  server.close();
});

// Google Agenda : les adresses qu'on colle par erreur, et une adresse secrète qui n'existe pas
const google = 'gilbert.test.inexistant.4821%40gmail.com';
for (const [label, raw] of [
  ['identifiant seul', 'gilbert.test@gmail.com'],
  ['adresse publique', `https://calendar.google.com/calendar/ical/${google}/public/basic.ics`],
  ["lien d'intégration", `https://calendar.google.com/calendar/embed?src=${google}`],
  ['adresse secrète inconnue', `https://calendar.google.com/calendar/ical/${google}/private-0123456789abcdef0123456789abcdef/basic.ics`],
] as const) {
  const cal = new Calendar();
  try {
    await cal.use(normalizeUrl(raw), { user: 'jules', password: 'secret' });
    console.log(`Google, ${label} → lu`);
  } catch (err) {
    console.log(`Google, ${label} → ${(err as Error).message}`);
  }
  cal.stop();
}
