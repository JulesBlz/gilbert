// L'onglet Journal : le carnet de bord, en trois temps.
// - Aujourd'hui : des tuiles (concentration, écran, glands, fait, mails, échanges), puis les applis ;
// - Cette semaine : les jours en barres, la comparaison avec la semaine d'avant, le meilleur jour,
//   la série, les applis de la semaine et le résumé de Gilbert ;
// - Depuis qu'on se connaît : les grands totaux ; puis les notes des jours d'avant et des semaines.

import { LOCALE, type JournalData, type JournalDay, type Lang } from '../shared/types';

const T = {
  fr: {
    today: "Aujourd'hui", week: 'Cette semaine', ever: 'Depuis qu’on se connaît', past: 'Les jours d’avant', weeks: 'Les semaines',
    focus: 'Concentration', screen: 'Devant l’écran', acorns: 'Glands', done: 'Fait', mails: 'Mails importants', chats: 'Échanges avec moi',
    sessions: (done: number, stopped: number) => `${done} terminée${done > 1 ? 's' : ''}${stopped ? `, ${stopped} arrêtée${stopped > 1 ? 's' : ''}` : ''}`,
    share: (p: number) => `dont ${p} % concentré`,
    total: (n: number) => `${n} au total`,
    apps: 'Où passe ton temps', weekApps: 'Tes applis de la semaine',
    vsLast: (p: number) => (p > 0 ? `+${p} % vs semaine dernière` : p < 0 ? `${p} % vs semaine dernière` : 'comme la semaine dernière'),
    firstWeek: 'première semaine',
    perDay: 'Par jour travaillé', best: 'Meilleur jour', streak: 'Série', days: (n: number) => `${n} jour${n > 1 ? 's' : ''}`,
    streakHint: 'd’affilée avec une session', completion: 'Sessions menées au bout',
    together: 'Ensemble depuis', focusEver: 'Concentration en tout', doneEver: 'Choses faites', golden: (n: number) => `dont ${n} doré${n > 1 ? 's' : ''}`,
    nothing: "Rien pour l'instant. Lance une session (« Gilbert, 25 minutes ») et je note tout.",
    off: 'Le carnet de bord est désactivé (dans les réglages, la roue crantée).', note: 'La note de Gilbert',
  },
  en: {
    today: 'Today', week: 'This week', ever: 'Since we met', past: 'Earlier days', weeks: 'Weeks',
    focus: 'Focus', screen: 'At the screen', acorns: 'Acorns', done: 'Done', mails: 'Important email', chats: 'Chats with me',
    sessions: (done: number, stopped: number) => `${done} finished${stopped ? `, ${stopped} stopped` : ''}`,
    share: (p: number) => `${p}% of it focused`,
    total: (n: number) => `${n} in total`,
    apps: 'Where your time goes', weekApps: 'Your apps this week',
    vsLast: (p: number) => (p > 0 ? `+${p}% vs last week` : p < 0 ? `${p}% vs last week` : 'same as last week'),
    firstWeek: 'first week',
    perDay: 'Per working day', best: 'Best day', streak: 'Streak', days: (n: number) => `${n} day${n > 1 ? 's' : ''}`,
    streakHint: 'in a row with a session', completion: 'Sessions completed',
    together: 'Together for', focusEver: 'Total focus', doneEver: 'Things done', golden: (n: number) => `${n} golden`,
    nothing: 'Nothing yet. Start a session ("Gilbert, 25 minutes") and I’ll log everything.',
    off: 'The logbook is turned off (in the settings, the gear).', note: "Gilbert's note",
  },
  vi: {
    today: 'Hôm nay', week: 'Tuần này', ever: 'Từ khi mình quen nhau', past: 'Những ngày trước', weeks: 'Các tuần',
    focus: 'Tập trung', screen: 'Trước màn hình', acorns: 'Quả sồi', done: 'Đã xong', mails: 'Email quan trọng', chats: 'Trò chuyện với tớ',
    sessions: (done: number, stopped: number) => `${done} buổi xong${stopped ? `, ${stopped} buổi dừng` : ''}`,
    share: (p: number) => `${p} % là tập trung`,
    total: (n: number) => `tổng ${n}`,
    apps: 'Thời gian của cậu đi đâu', weekApps: 'Ứng dụng tuần này',
    vsLast: (p: number) => (p > 0 ? `+${p} % so với tuần trước` : p < 0 ? `${p} % so với tuần trước` : 'như tuần trước'),
    firstWeek: 'tuần đầu tiên',
    perDay: 'Mỗi ngày làm việc', best: 'Ngày tốt nhất', streak: 'Chuỗi', days: (n: number) => `${n} ngày`,
    streakHint: 'liên tiếp có buổi làm việc', completion: 'Buổi làm trọn vẹn',
    together: 'Bên nhau được', focusEver: 'Tổng thời gian tập trung', doneEver: 'Việc đã xong', golden: (n: number) => `${n} quả vàng`,
    nothing: 'Chưa có gì. Bắt đầu một buổi (« Gilbert, 25 phút ») và tớ ghi lại hết.',
    off: 'Nhật ký đang tắt (trong cài đặt, bánh răng).', note: 'Ghi chú của Gilbert',
  },
};

function h<E extends HTMLElement = HTMLElement>(tag: string, props: Record<string, unknown> = {}, ...children: (Node | string)[]): E {
  const el = Object.assign(document.createElement(tag), props) as E;
  el.append(...children);
  return el;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const screenTime = (d?: JournalDay) => (d ? sum(Object.values(d.apps)) : 0);

/** Une barre pixel : `value` sur `max` */
function bar(value: number, max: number, label: string, right: string) {
  const fill = h('i');
  fill.style.width = `${max ? Math.round((value / max) * 100) : 0}%`;
  return h('div', { className: 'bar' }, h('span', { className: 'bar-label' }, label), h('span', { className: 'bar-track' }, fill), h('span', { className: 'bar-value' }, right));
}

/** Une tuile : un chiffre, ce qu'il compte, et une précision */
function tile(label: string, value: string, sub = '') {
  return h('div', { className: 'tile' }, h('small', {}, label), h('b', {}, value), ...(sub ? [h('span', {}, sub)] : []));
}

function streak(data: JournalData) {
  let n = 0;
  const d = new Date();
  if (!data.days[iso(d)]?.focus.sessions) d.setDate(d.getDate() - 1);
  while (data.days[iso(d)]?.focus.sessions) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/** Les applis d'une liste de jours, de la plus utilisée à la moins utilisée */
function topApps(days: (JournalDay | undefined)[], n: number) {
  const all = new Map<string, number>();
  for (const d of days) for (const [a, m] of Object.entries(d?.apps ?? {})) all.set(a, (all.get(a) ?? 0) + m);
  return [...all.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function appBars(apps: [string, number][], total: number) {
  return apps.map(([a, m]) => bar(m, apps[0][1], a, `${hm(m)}${total ? ` · ${Math.round((m / total) * 100)} %` : ''}`));
}

const notes = (text: string) => h('div', { className: 'help' }, ...text.split('\n').map((l) => h('p', {}, l)));

export function renderJournal(el: HTMLElement, data: JournalData, lang: Lang, enabled: boolean) {
  const t = T[lang];
  const locale = LOCALE[lang];
  const sections: HTMLElement[] = [];
  if (!enabled) sections.push(h('p', { className: 'empty' }, t.off));

  // ----- aujourd'hui -----
  const today = data.days[iso(new Date())];
  const todaySec = h('section', {}, h('h2', {}, t.today));
  const screen = screenTime(today);
  if (today && (today.focus.minutes || screen || today.done.length || today.chats)) {
    const f = today.focus;
    todaySec.append(h('div', { className: 'tiles' },
      tile(t.focus, hm(f.minutes), t.sessions(f.sessions, f.stopped)),
      tile(t.screen, hm(screen), screen && f.minutes ? t.share(Math.min(100, Math.round((f.minutes / screen) * 100))) : ''),
      tile(t.acorns, `+${today.acorns ?? 0}`, t.total(data.acorns.total)),
      tile(t.done, String(today.done.length), today.done.slice(0, 2).join(', ')),
      tile(t.mails, String(today.mails)),
      tile(t.chats, String(today.chats)),
    ));
    const apps = topApps([today], 6);
    if (apps.length) todaySec.append(h('div', { className: 'label' }, t.apps), ...appBars(apps, screen));
    if (today.note) todaySec.append(notes(today.note));
  } else {
    todaySec.append(h('p', { className: 'empty' }, t.nothing));
  }
  sections.push(todaySec);

  // ----- la semaine -----
  const weekSec = h('section', {}, h('h2', {}, t.week));
  const monday = new Date();
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const dayAt = (offset: number) => { const d = new Date(monday); d.setDate(d.getDate() + offset); return d; };
  const week = Array.from({ length: 7 }, (_, i) => dayAt(i));
  const lastWeek = Array.from({ length: 7 }, (_, i) => dayAt(i - 7));
  const mins = week.map((d) => data.days[iso(d)]?.focus.minutes ?? 0);
  const max = Math.max(...mins, 25);
  week.forEach((d, i) => weekSec.append(bar(mins[i], max, d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' }), hm(mins[i]))));
  const total = sum(mins);
  const before = sum(lastWeek.map((d) => data.days[iso(d)]?.focus.minutes ?? 0));
  const worked = mins.filter(Boolean).length;
  const bestI = mins.indexOf(Math.max(...mins));
  const finished = sum(week.map((d) => data.days[iso(d)]?.focus.sessions ?? 0));
  const stopped = sum(week.map((d) => data.days[iso(d)]?.focus.stopped ?? 0));
  const s = streak(data);
  weekSec.append(h('div', { className: 'tiles' },
    tile(t.focus, hm(total), before ? t.vsLast(Math.round(((total - before) / before) * 100)) : t.firstWeek),
    tile(t.perDay, worked ? hm(Math.round(total / worked)) : '—', t.days(worked)),
    tile(t.best, total ? week[bestI].toLocaleDateString(locale, { weekday: 'long' }) : '—', total ? hm(mins[bestI]) : ''),
    tile(t.streak, t.days(s), t.streakHint),
    tile(t.completion, finished + stopped ? `${Math.round((finished / (finished + stopped)) * 100)} %` : '—', finished + stopped ? t.sessions(finished, stopped) : ''),
    tile(t.screen, hm(sum(week.map((d) => screenTime(data.days[iso(d)])))), ''),
  ));
  const weekApps = topApps(week.map((d) => data.days[iso(d)]), 5);
  if (weekApps.length) weekSec.append(h('div', { className: 'label' }, t.weekApps), ...appBars(weekApps, sum(week.map((d) => screenTime(data.days[iso(d)])))));
  const summary = data.weeks[iso(monday)];
  if (summary) weekSec.append(notes(summary));
  sections.push(weekSec);

  // ----- depuis le début -----
  const all = Object.values(data.days);
  const since = Math.max(1, Math.floor((Date.now() - data.firstSeen) / 86_400_000) + 1);
  sections.push(h('section', {}, h('h2', {}, t.ever), h('div', { className: 'tiles' },
    tile(t.together, t.days(since)),
    tile(t.focusEver, hm(sum(all.map((d) => d.focus.minutes)))),
    tile(t.acorns, String(data.acorns.total), data.acorns.golden ? t.golden(data.acorns.golden) : ''),
    tile(t.doneEver, String(sum(all.map((d) => d.done.length)))),
  )));

  // ----- les jours d'avant, avec la note de Gilbert -----
  const past = Object.keys(data.days).filter((k) => k < iso(new Date()) && (data.days[k].note || data.days[k].focus.minutes)).sort().reverse().slice(0, 14);
  if (past.length) {
    const pastSec = h('section', {}, h('h2', {}, t.past));
    for (const k of past) {
      const d = data.days[k];
      const date = new Date(`${k}T12:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
      pastSec.append(h('div', { className: 'label' }, `${date} · ${t.focus.toLowerCase()} ${hm(d.focus.minutes)}${d.acorns ? ` · ${d.acorns} ${t.acorns.toLowerCase()}` : ''}`));
      if (d.note) pastSec.append(notes(d.note));
    }
    sections.push(pastSec);
  }

  // ----- les résumés des semaines passées -----
  const weeks = Object.keys(data.weeks).filter((k) => k < iso(monday) && data.weeks[k]).sort().reverse().slice(0, 8);
  if (weeks.length) {
    const weeksSec = h('section', {}, h('h2', {}, t.weeks));
    for (const k of weeks) {
      weeksSec.append(h('div', { className: 'label' }, new Date(`${k}T12:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long' })), notes(data.weeks[k]));
    }
    sections.push(weeksSec);
  }
  el.replaceChildren(...sections);
}
