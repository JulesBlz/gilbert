// Connexions : brancher ses mails (IMAP + mot de passe d'application) et son agenda (adresse iCal).
// Rien ne passe par un serveur tiers : Gilbert parle directement à ta boîte mail et à ton agenda.

// C'est un onglet de la fenêtre des réglages.
import './connections.css';
import type { ConnectionsApi, ConnStatus, Lang, MailSettings } from '../shared/types';

declare global {
  interface Window { connections?: ConnectionsApi }
}

const T = {
  fr: {
    intro: 'Tout reste sur ton ordinateur : Gilbert lit tes mails et ton agenda directement, sans passer par un serveur. Il ne peut rien envoyer ni modifier.',
    mail: 'Tes mails',
    address: 'Adresse mail',
    password: "Mot de passe d'application",
    passwordKept: '•••• enregistré (laisser vide pour le garder)',
    advanced: 'Réglages avancés',
    host: 'Serveur IMAP',
    port: 'Port',
    user: 'Identifiant (souvent ton adresse)',
    gmailHelp: [
      'Avec Gmail :',
      '1. Active la validation en deux étapes sur ton compte Google.',
      "2. Crée un mot de passe d'application (nom : « Gilbert »), ici :",
      '3. Colle les 16 lettres ci-dessus.',
    ],
    gmailLink: 'myaccount.google.com/apppasswords',
    calendar: 'Ton agenda',
    calendarUrl: 'Adresse secrète au format iCal',
    calendarHelp: [
      'Avec Google Agenda : ouvre les paramètres, choisis ton agenda dans la colonne de gauche,',
      'puis « Intégrer l’agenda » → tout en bas, « Adresse secrète au format iCal ». Copie-la ici.',
      'Elle contient « private- » et marche même si ton agenda est privé, sans mot de passe : garde-la pour toi.',
      'Pas l’« Adresse publique » ni le « Code d’intégration » : ceux-là ne marchent que pour un agenda public.',
    ],
    calendarLink: 'Ouvrir les paramètres de Google Agenda',
    calendarPrivate: 'Agenda protégé par un mot de passe',
    calendarPrivateHelp: "Seulement pour un agenda hors Google qui demande un identifiant (iCloud, Nextcloud, agenda d'entreprise…). Google, lui, n'accepte jamais de mot de passe : prends son adresse secrète.",
    calendarUser: 'Identifiant',
    calendarPassword: 'Mot de passe',
    save: 'Tester et enregistrer',
    disconnect: 'Débrancher',
    testing: 'Test en cours…',
    status: { off: 'Pas branché', connecting: 'Connexion…', on: 'Branché', error: 'Erreur' },
  },
  en: {
    intro: 'Everything stays on your computer: Gilbert reads your email and calendar directly, with no server in between. He cannot send or change anything.',
    mail: 'Your email',
    address: 'Email address',
    password: 'App password',
    passwordKept: '•••• saved (leave empty to keep it)',
    advanced: 'Advanced settings',
    host: 'IMAP server',
    port: 'Port',
    user: 'Username (usually your address)',
    gmailHelp: [
      'With Gmail:',
      '1. Turn on 2-Step Verification on your Google account.',
      '2. Create an app password (name: "Gilbert") here:',
      '3. Paste the 16 letters above.',
    ],
    gmailLink: 'myaccount.google.com/apppasswords',
    calendar: 'Your calendar',
    calendarUrl: 'Secret address in iCal format',
    calendarHelp: [
      'With Google Calendar: open settings, pick your calendar in the left column,',
      'then "Integrate calendar" → at the very bottom, "Secret address in iCal format". Paste it here.',
      'It contains "private-" and works even if your calendar is private, with no password: keep it to yourself.',
      'Not the "Public address" nor the "Embed code": those only work for a public calendar.',
    ],
    calendarLink: 'Open Google Calendar settings',
    calendarPrivate: 'Password-protected calendar',
    calendarPrivateHelp: 'Only if the address asks for a username (iCloud, Nextcloud, work calendar…). Not needed for the Google secret address.',
    calendarUser: 'Username',
    calendarPassword: 'Password',
    save: 'Test and save',
    disconnect: 'Disconnect',
    testing: 'Testing…',
    status: { off: 'Not connected', connecting: 'Connecting…', on: 'Connected', error: 'Error' },
  },
  vi: {
    intro: 'Mọi thứ ở lại trên máy của cậu: Gilbert đọc email và lịch trực tiếp, không qua máy chủ nào. Tớ không thể gửi hay sửa gì cả.',
    mail: 'Email của cậu',
    address: 'Địa chỉ email',
    password: 'Mật khẩu ứng dụng',
    passwordKept: '•••• đã lưu (để trống để giữ nguyên)',
    advanced: 'Cài đặt nâng cao',
    host: 'Máy chủ IMAP',
    port: 'Cổng',
    user: 'Tên đăng nhập (thường là địa chỉ email)',
    gmailHelp: [
      'Với Gmail:',
      '1. Bật xác minh 2 bước cho tài khoản Google.',
      '2. Tạo mật khẩu ứng dụng (tên: « Gilbert ») tại đây:',
      '3. Dán 16 chữ cái vào ô bên trên.',
    ],
    gmailLink: 'myaccount.google.com/apppasswords',
    calendar: 'Lịch của cậu',
    calendarUrl: 'Địa chỉ bí mật ở định dạng iCal',
    calendarHelp: [
      'Với Google Lịch: mở Cài đặt, chọn lịch của cậu ở cột bên trái,',
      'rồi « Tích hợp lịch » → dưới cùng, « Địa chỉ bí mật ở định dạng iCal ». Dán vào đây.',
      'Địa chỉ này có chữ « private- » và dùng được cả khi lịch ở chế độ riêng tư, không cần mật khẩu: đừng chia sẻ nó.',
      'Không phải « Địa chỉ công khai » hay « Mã nhúng »: chúng chỉ dùng được cho lịch công khai.',
    ],
    calendarLink: 'Mở cài đặt Google Lịch',
    calendarPrivate: 'Lịch có mật khẩu',
    calendarPrivateHelp: 'Chỉ khi địa chỉ yêu cầu tên đăng nhập (iCloud, Nextcloud, lịch công ty…). Không cần cho địa chỉ bí mật của Google.',
    calendarUser: 'Tên đăng nhập',
    calendarPassword: 'Mật khẩu',
    save: 'Kiểm tra và lưu',
    disconnect: 'Ngắt kết nối',
    testing: 'Đang kiểm tra…',
    status: { off: 'Chưa kết nối', connecting: 'Đang kết nối…', on: 'Đã kết nối', error: 'Lỗi' },
  },
};

type Status = { mail: ConnStatus; calendar: ConnStatus };

// aperçu navigateur : des connexions factices
const api: ConnectionsApi = window.connections ?? {
  get: async () => ({ lang: 'fr' as Lang, mail: null, hasPassword: false, calendarUrl: '', calendarUser: '', hasCalendarPassword: false, status: { mail: { state: 'off' }, calendar: { state: 'off' } } }),
  saveMail: async () => ({ ok: false, message: 'Aperçu : pas de vraie connexion.' }),
  disconnectMail: () => {},
  saveCalendar: async () => ({ ok: false, message: 'Aperçu : pas de vraie connexion.' }),
  disconnectCalendar: () => {},
  openExternal: (url) => window.open(url),
  onStatus: () => {},
};

/** Serveur IMAP deviné d'après l'adresse */
function guessHost(address: string) {
  const domain = address.split('@')[1]?.toLowerCase() ?? '';
  if (/^(gmail|googlemail)\./.test(domain)) return 'imap.gmail.com';
  if (/^(outlook|hotmail|live|msn)\./.test(domain)) return 'outlook.office365.com';
  if (/^(icloud|me|mac)\./.test(domain)) return 'imap.mail.me.com';
  if (/^(yahoo|ymail)\./.test(domain)) return 'imap.mail.yahoo.com';
  return domain ? `imap.${domain}` : '';
}

let t = T.fr;
let app: HTMLElement;

function h<E extends HTMLElement = HTMLElement>(tag: string, props: Record<string, unknown> = {}, ...children: (Node | string)[]): E {
  const el = Object.assign(document.createElement(tag), props) as E;
  el.append(...children);
  return el;
}

function field(label: string, el: HTMLElement) {
  return h('label', { className: 'field' }, h('span', {}, label), el);
}

function statusLine(s: ConnStatus) {
  const text = s.state === 'on' ? `${t.status.on} · ${s.detail}` : s.state === 'error' ? `${t.status.error} : ${s.message}` : t.status[s.state];
  return h('p', { className: `status ${s.state}` }, text);
}

function link(text: string, url: string) {
  const a = h<HTMLAnchorElement>('a', { href: '#', textContent: text });
  a.addEventListener('click', (e) => { e.preventDefault(); api.openExternal(url); });
  return a;
}

let mailStatus: HTMLElement, calStatus: HTMLElement;

function render(data: Awaited<ReturnType<ConnectionsApi['get']>>) {
  const m: MailSettings = data.mail ?? { address: '', host: '', port: 993, user: '' };

  // ----- mails -----
  const address = h<HTMLInputElement>('input', { type: 'email', value: m.address, placeholder: 'prenom@gmail.com' });
  const password = h<HTMLInputElement>('input', { type: 'password', placeholder: data.hasPassword ? t.passwordKept : 'abcd efgh ijkl mnop', autocomplete: 'off' });
  const host = h<HTMLInputElement>('input', { value: m.host, placeholder: 'imap.gmail.com' });
  const port = h<HTMLInputElement>('input', { type: 'number', value: String(m.port || 993) });
  const user = h<HTMLInputElement>('input', { value: m.user, placeholder: t.address });
  address.addEventListener('input', () => {
    if (!host.dataset.touched) host.value = guessHost(address.value);
    if (!user.dataset.touched) user.value = address.value;
  });
  host.addEventListener('input', () => { host.dataset.touched = '1'; });
  user.addEventListener('input', () => { user.dataset.touched = '1'; });

  const mailResult = h('p', { className: 'result' });
  const saveMail = h<HTMLButtonElement>('button', { textContent: t.save });
  saveMail.addEventListener('click', async () => {
    saveMail.disabled = true;
    mailResult.className = 'result';
    mailResult.textContent = t.testing;
    const r = await api.saveMail({ address: address.value, host: host.value || guessHost(address.value), port: Number(port.value) || 993, user: user.value || address.value, password: password.value });
    saveMail.disabled = false;
    mailResult.className = `result ${r.ok ? 'ok' : 'ko'}`;
    mailResult.textContent = r.message;
    if (r.ok) { password.value = ''; password.placeholder = t.passwordKept; }
  });
  const disMail = h<HTMLButtonElement>('button', { className: 'ghost', textContent: t.disconnect });
  disMail.addEventListener('click', () => { api.disconnectMail(); mailResult.textContent = ''; });

  const help = h('div', { className: 'help' },
    ...t.gmailHelp.slice(0, 3).map((l, i) => h('p', {}, l, ...(i === 2 ? [' ', link(t.gmailLink, 'https://myaccount.google.com/apppasswords')] : []))),
    h('p', {}, t.gmailHelp[3]));

  const advanced = h('details', {}, h('summary', {}, t.advanced), field(t.host, host), field(t.port, port), field(t.user, user));
  mailStatus = statusLine(data.status.mail);
  const mailSection = h('section', {}, h('h2', {}, t.mail), mailStatus,
    field(t.address, address), field(t.password, password), help, advanced,
    h('div', { className: 'actions' }, saveMail, disMail), mailResult);

  // ----- agenda -----
  const url = h<HTMLInputElement>('input', { value: data.calendarUrl, placeholder: 'https://calendar.google.com/calendar/ical/…/basic.ics' });
  const calUser = h<HTMLInputElement>('input', { value: data.calendarUser, autocomplete: 'off' });
  const calPassword = h<HTMLInputElement>('input', { type: 'password', autocomplete: 'off', placeholder: data.hasCalendarPassword ? t.passwordKept : '' });
  const calPrivate = h<HTMLDetailsElement>('details', { open: Boolean(data.calendarUser || data.hasCalendarPassword) },
    h('summary', {}, t.calendarPrivate),
    h('div', { className: 'help' }, h('p', {}, t.calendarPrivateHelp)),
    field(t.calendarUser, calUser), field(t.calendarPassword, calPassword));
  const calResult = h('p', { className: 'result' });
  const saveCal = h<HTMLButtonElement>('button', { textContent: t.save });
  saveCal.addEventListener('click', async () => {
    saveCal.disabled = true;
    calResult.className = 'result';
    calResult.textContent = t.testing;
    const r = await api.saveCalendar(url.value, { user: calUser.value, password: calPassword.value });
    saveCal.disabled = false;
    calResult.className = `result ${r.ok ? 'ok' : 'ko'}`;
    calResult.textContent = r.message;
    if (r.ok && calPassword.value) { calPassword.value = ''; calPassword.placeholder = t.passwordKept; }
  });
  const disCal = h<HTMLButtonElement>('button', { className: 'ghost', textContent: t.disconnect });
  disCal.addEventListener('click', () => {
    api.disconnectCalendar();
    url.value = calUser.value = calPassword.value = '';
    calPassword.placeholder = '';
    calResult.textContent = '';
  });
  calStatus = statusLine(data.status.calendar);
  const calSection = h('section', {}, h('h2', {}, t.calendar), calStatus,
    field(t.calendarUrl, url),
    h('div', { className: 'help' }, ...t.calendarHelp.map((l) => h('p', {}, l)), h('p', {}, link(t.calendarLink, 'https://calendar.google.com/calendar/r/settings'))),
    calPrivate,
    h('div', { className: 'actions' }, saveCal, disCal), calResult);

  app.replaceChildren(
    h('p', { className: 'intro' }, t.intro),
    mailSection,
    calSection,
  );
}

/** Affiche les connexions dans `root` et suit leur état */
export function mountConnections(root: HTMLElement) {
  app = root;
  api.get().then((data) => {
    t = T[data.lang] ?? T.fr;
    render(data);
  });
  api.onStatus((s: Status) => {
    mailStatus?.replaceWith((mailStatus = statusLine(s.mail)));
    calStatus?.replaceWith((calStatus = statusLine(s.calendar)));
  });
}
