// Vérifie la lecture d'agenda sur un fichier de test (fuseau, récurrence, exception, journée entière).
//   node scripts/calendar-test.ts
import { readFileSync } from 'node:fs';
import { parseIcs } from '../src/main/calendar.ts';

const text = readFileSync(new URL('./fixtures/agenda.ics', import.meta.url), 'utf8');
const from = Date.parse('2026-10-26T00:00:00+01:00'), to = Date.parse('2026-11-10T00:00:00+01:00');
const fmt = (t: number) => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
for (const e of parseIcs(text, from, to)) console.log(`${fmt(e.start)} → ${fmt(e.end)}  ${e.allDay ? '[journée] ' : ''}${e.title}${e.location ? ` (${e.location})` : ''}`);
