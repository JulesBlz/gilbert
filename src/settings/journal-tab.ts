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
    together: 'Ensemble depuis', focusEver: 'Concentration en tout', doneEver: 'Choses faites',
    nothing: "Rien pour l'instant. Lance une session (« Gilbert, 25 minutes ») et je note tout.",
    usedDays: (n: number) => `sur ${n} jour${n > 1 ? 's' : ''}`,
    topApp: 'Appli n°1', avg: 'Moyenne par jour', longest: 'Jour le plus long', peak: 'Heure de pointe', hours: 'Dans la journée', cats: 'Par type d’usage', weekScreen: 'Devant l’écran', untilNow: 'jusqu’ici', focusFold: 'Sessions de concentration', pomodoro: 'Tu peux aussi lancer une session de concentration : « Gilbert, 25 minutes ».',
    category: { web: 'Navigation web', talk: 'Messages et mails', work: 'Travail et outils', create: 'Création', media: 'Musique et vidéo', game: 'Jeux', other: 'Autres' },
    off: 'Le carnet de bord est désactivé.', enable: 'Activer le carnet de bord', start: 'Lancer 25 minutes', note: 'La note de Gilbert',
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
    together: 'Together for', focusEver: 'Total focus', doneEver: 'Things done',
    nothing: 'Nothing yet. Start a session ("Gilbert, 25 minutes") and I’ll log everything.',
    usedDays: (n: number) => `over ${n} day${n > 1 ? 's' : ''}`,
    topApp: 'Top app', avg: 'Daily average', longest: 'Longest day', peak: 'Peak hour', hours: 'During the day', cats: 'By kind of use', weekScreen: 'At the screen', untilNow: 'so far', focusFold: 'Focus sessions', pomodoro: 'You can also start a focus session: “Gilbert, 25 minutes”.',
    category: { web: 'Web browsing', talk: 'Messages and email', work: 'Work and tools', create: 'Creative', media: 'Music and video', game: 'Games', other: 'Other' },
    off: 'The logbook is turned off.', enable: 'Turn the logbook on', start: 'Start 25 minutes', note: "Gilbert's note",
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
    together: 'Bên nhau được', focusEver: 'Tổng thời gian tập trung', doneEver: 'Việc đã xong',
    nothing: 'Chưa có gì. Bắt đầu một buổi (« Gilbert, 25 phút ») và tớ ghi lại hết.',
    usedDays: (n: number) => `trong ${n} ngày`,
    topApp: 'Ứng dụng số 1', avg: 'Trung bình mỗi ngày', longest: 'Ngày dài nhất', peak: 'Giờ cao điểm', hours: 'Trong ngày', cats: 'Theo loại dùng', weekScreen: 'Trước màn hình', untilNow: 'đến giờ', focusFold: 'Các buổi tập trung', pomodoro: 'Cậu cũng có thể bắt đầu một buổi tập trung: « Gilbert, 25 phút ».',
    category: { web: 'Duyệt web', talk: 'Tin nhắn và email', work: 'Công việc và công cụ', create: 'Sáng tạo', media: 'Nhạc và video', game: 'Trò chơi', other: 'Khác' },
    off: 'Nhật ký đang tắt.', enable: 'Bật nhật ký', start: 'Bắt đầu 25 phút', note: 'Ghi chú của Gilbert',
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
function bar(value: number, max: number, label: string, right: string, cls = '') {
  const fill = h('i');
  fill.style.width = `${max ? Math.round((value / max) * 100) : 0}%`;
  return h('div', { className: `bar ${cls}`.trim() }, h('span', { className: 'bar-label' }, label), h('span', { className: 'bar-track' }, fill), h('span', { className: 'bar-value' }, right));
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

/** `act` : les actions des états vides (activer le carnet, lancer une session) */
export function renderJournal(el: HTMLElement, data: JournalData, lang: Lang, enabled: boolean, act?: { enable(): void; focus(): void }) {
  const t = T[lang];
  const locale = LOCALE[lang];
  const sections: HTMLElement[] = [];
  const cta = (label: string, go?: () => void) => {
    const b = h<HTMLButtonElement>('button', { className: 'primary', textContent: label, type: 'button' });
    b.addEventListener('click', () => go?.());
    return b;
  };
  if (!enabled) sections.push(h('div', { className: 'empty-state' }, h('p', {}, t.off), ...(act ? [cta(t.enable, act.enable)] : [])));

  const kindOf = (app: string): keyof typeof t.category => {
    if (/safari|chrome|firefox|arc\b|edge|brave|opera|vivaldi/i.test(app)) return 'web';
    if (/messages|whatsapp|slack|discord|telegram|signal|mail|outlook|teams|zoom|messenger|thunderbird|skype/i.test(app)) return 'talk';
    if (/figma|photoshop|illustrator|premiere|final cut|blender|sketch|canva|lightroom|davinci|procreate|aseprite|indesign|affinity/i.test(app)) return 'create';
    if (/spotify|music|musique|vlc|netflix|youtube|podcast|twitch|iina|plex|tv\b|disney|deezer/i.test(app)) return 'media';
    if (/steam|minecraft|epic|battle\.net|riot|league|valorant|roblox|fortnite|game/i.test(app)) return 'game';
    if (/code|xcode|terminal|iterm|cursor|intellij|webstorm|pycharm|claude|notion|obsidian|word|excel|pages|numbers|keynote|powerpoint|docs|sublime|warp|ghostty|finder|preview|aperçu|notes|calendar|calendrier|reminders|rappels|powershell|cmd/i.test(app)) return 'work';
    return 'other';
  };
  const byKind = (days: (JournalDay | undefined)[]) => {
    const m = new Map<string, number>();
    for (const d of days) for (const [a, min] of Object.entries(d?.apps ?? {})) m.set(kindOf(a), (m.get(kindOf(a)) ?? 0) + min);
    return [...m.entries()].map(([k, min]) => [t.category[k as keyof typeof t.category], min] as [string, number]).sort((a, b) => b[1] - a[1]);
  };
  const hoursOf = (d?: JournalDay) => d?.hours ?? [];
  /** Les 24 heures en colonnes : la plus chargée en orange */
  const dayShape = (hours: number[]) => {
    const peak = Math.max(...hours, 1);
    const top = hours.indexOf(Math.max(...hours));
    const cols = Array.from({ length: 24 }, (_, i) => {
      const col = h('i', { className: i === top ? 'peak' : '' });
      col.style.height = `${Math.max(hours[i] ? 8 : 2, Math.round(((hours[i] ?? 0) / peak) * 64))}px`;
      col.title = `${i} h · ${hm(hours[i] ?? 0)}`;
      return col;
    });
    return h('div', { className: 'shape' }, h('div', { className: 'cols' }, ...cols), h('div', { className: 'ticks' }, ...[0, 6, 12, 18, 23].map((n) => h('span', {}, `${n} h`))));
  };

  // ----- aujourd'hui : le temps d'écran, d'abord -----
  const today = data.days[iso(new Date())];
  const todaySec = h('section', {}, h('h2', {}, t.today));
  const screen = screenTime(today);
  if (today && (screen || today.done.length || today.chats)) {
    const apps = topApps([today], 8);
    const hrs = hoursOf(today);
    const peakH = hrs.length && Math.max(...hrs) ? hrs.indexOf(Math.max(...hrs)) : -1;
    todaySec.append(h('div', { className: 'tiles' },
      tile(t.screen, hm(screen), t.untilNow),
      tile(t.topApp, apps[0]?.[0] ?? '—', apps[0] ? `${hm(apps[0][1])}${screen ? ` · ${Math.round((apps[0][1] / screen) * 100)} %` : ''}` : ''),
      tile(t.peak, peakH >= 0 ? `${peakH} h` : '—', peakH >= 0 ? hm(hrs[peakH]) : ''),
    ));
    if (apps.length) todaySec.append(h('div', { className: 'label' }, t.apps), ...appBars(apps, screen));
    const kinds = byKind([today]);
    if (kinds.length > 1) todaySec.append(h('div', { className: 'label' }, t.cats), ...kinds.map(([k, m]) => bar(m, kinds[0][1], k, `${hm(m)} · ${Math.round((m / screen) * 100)} %`)));
    if (hrs.some(Boolean)) todaySec.append(h('div', { className: 'label' }, t.hours), dayShape(hrs));
    if (today.note) todaySec.append(notes(today.note));
  } else {
    todaySec.append(h('div', { className: 'empty-state' }, h('p', {}, t.nothing)));
  }
  sections.push(todaySec);

  // ----- la semaine : le temps d'écran jour par jour -----
  const weekSec = h('section', {}, h('h2', {}, t.week));
  const monday = new Date();
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const dayAt = (offset: number) => { const d = new Date(monday); d.setDate(d.getDate() + offset); return d; };
  const week = Array.from({ length: 7 }, (_, i) => dayAt(i));
  const lastWeek = Array.from({ length: 7 }, (_, i) => dayAt(i - 7));
  const mins = week.map((d) => screenTime(data.days[iso(d)]));
  const max = Math.max(...mins, 60);
  const todayIdx = (new Date().getDay() + 6) % 7;
  week.forEach((d, i) => weekSec.append(bar(mins[i], max, d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' }), hm(mins[i]), i === todayIdx ? 'today' : mins[i] ? '' : 'zero')));
  const total = sum(mins);
  const before = sum(lastWeek.map((d) => screenTime(data.days[iso(d)])));
  const used = mins.filter(Boolean).length;
  const longI = mins.indexOf(Math.max(...mins));
  const weekApps = topApps(week.map((d) => data.days[iso(d)]), 8);
  weekSec.append(h('div', { className: 'tiles' },
    tile(t.weekScreen, hm(total), before ? t.vsLast(Math.round(((total - before) / before) * 100)) : t.firstWeek),
    tile(t.avg, used ? hm(Math.round(total / used)) : '—', used ? t.usedDays(used) : ''),
    tile(t.longest, total ? week[longI].toLocaleDateString(locale, { weekday: 'long' }) : '—', total ? hm(mins[longI]) : ''),
  ));
  if (weekApps.length) weekSec.append(h('div', { className: 'label' }, t.weekApps), ...appBars(weekApps, total));
  const weekKinds = byKind(week.map((d) => data.days[iso(d)]));
  if (weekKinds.length > 1) weekSec.append(h('div', { className: 'label' }, t.cats), ...weekKinds.map(([k, m]) => bar(m, weekKinds[0][1], k, `${hm(m)} · ${Math.round((m / total) * 100)} %`)));
  const weekHours = Array.from({ length: 24 }, (_, i) => sum(week.map((d) => hoursOf(data.days[iso(d)])[i] ?? 0)));
  if (weekHours.some(Boolean)) weekSec.append(h('div', { className: 'label' }, t.hours), dayShape(weekHours));
  const summary = data.weeks[iso(monday)];
  if (summary) weekSec.append(notes(summary));
  sections.push(weekSec);

  // ----- depuis le début -----
  const all = Object.values(data.days);
  const since = Math.max(1, Math.floor((Date.now() - data.firstSeen) / 86_400_000) + 1);
  const everApps = topApps(all, 1);
  sections.push(h('section', {}, h('h2', {}, t.ever), h('div', { className: 'tiles' },
    tile(t.together, t.days(since)),
    tile(t.screen, hm(sum(all.map((d) => screenTime(d))))),
    tile(t.topApp, everApps[0]?.[0] ?? '—', everApps[0] ? hm(everApps[0][1]) : ''),
    tile(t.acorns, String(data.acorns.total)),
    tile(t.doneEver, String(sum(all.map((d) => d.done.length)))),
  )));

  // ----- la concentration : en retrait, pour ceux qui s'en servent -----
  const focusEver = sum(all.map((d) => d.focus.minutes));
  const todayFocus = today?.focus;
  const fFinished = sum(week.map((d) => data.days[iso(d)]?.focus.sessions ?? 0));
  const fStopped = sum(week.map((d) => data.days[iso(d)]?.focus.stopped ?? 0));
  const fold = h('section', { className: 'fold' });
  const det = h<HTMLDetailsElement>('details', {}, h('summary', {}, t.focusFold));
  if (focusEver) {
    det.append(h('div', { className: 'tiles' },
      tile(t.focus, hm(todayFocus?.minutes ?? 0), todayFocus ? t.sessions(todayFocus.sessions, todayFocus.stopped) : ''),
      tile(t.week, hm(sum(week.map((d) => data.days[iso(d)]?.focus.minutes ?? 0))), fFinished + fStopped ? t.sessions(fFinished, fStopped) : ''),
      tile(t.streak, t.days(streak(data)), t.streakHint),
      tile(t.focusEver, hm(focusEver)),
    ));
  } else {
    det.append(notes(t.pomodoro));
    if (act) det.append(cta(t.start, act.focus));
  }
  fold.append(det);
  sections.push(fold);

  // ----- les jours d'avant, avec la note de Gilbert -----
  const past = Object.keys(data.days).filter((k) => k < iso(new Date()) && (data.days[k].note || screenTime(data.days[k]))).sort().reverse().slice(0, 14);
  if (past.length) {
    const pastSec = h('section', {}, h('h2', {}, t.past));
    for (const k of past) {
      const d = data.days[k];
      const date = new Date(`${k}T12:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
      pastSec.append(h('div', { className: 'label' }, `${date} · ${t.screen.toLowerCase()} ${hm(screenTime(d))}${d.acorns ? ` · ${d.acorns} ${t.acorns.toLowerCase()}` : ''}`));
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
