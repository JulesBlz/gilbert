// Process principal : une fenêtre transparente posée sur la zone utile de l'écran,
// traversée par la souris partout sauf sur Gilbert, plus une icône de barre des menus.

import {
  app, BrowserWindow, clipboard, ipcMain, Menu, Tray, screen, powerMonitor, nativeImage, shell, session, systemPreferences,
  type MenuItemConstructorOptions,
} from 'electron';
import path from 'node:path';
import { loadSettings, saveSettings } from './settings';
import { Brain } from './brain/brain';
import { explicitSearch, looksLikeLookup, siteOf, webContext, webQuery, webSearch, type WebResult } from './web';
import { MODELS, isDownloaded, ramGB, recommended } from './brain/models';
import { learn } from './brain/knowledge';
import { describeReminder, parseReminder, REMIND } from './brain/remind';
import { aboutMail, mailContext, mailQuery } from './mailbox';
import { MemoryStore } from './memory';
import { ChatStore } from './chats';
import { MENU } from '../shared/menu';
import { onPageWindow, openSettings, pageWindow } from './windows';
import { Assistant } from './assistant';
import { ScreenWatcher } from './vision/watch';
import { askPermission, permission, supported as visionSupported } from './vision/capture';
import { describe, Music, type Track } from './music';
import { dayIsEmpty, isoDay, Journal, weekOf, writeDayNote, writeWeek } from './journal';
import { Focus, FOCUS_START } from './focus';
import { frontWindow } from './vision/capture';
import { ClipboardHelper } from './clipboard';
import { MessageBadges } from './messages';
import { FRESH, desktopHome, desktopSupported, finishInstall, moveToDesktop, setHomeIcon } from './desktop';
import { ProjectStore, type Sources } from './projects';
import { projectIdea, projectReport, screenInsight } from './brain/projects';
import { checkForUpdate, download, install, type Update } from './updater';
import { itemById, RETIRED } from '../shared/skins';
import { splitTask, todoDone, todoSplit, todoToAdd } from './todo';
import { transcribe } from './voice';
import { FOLDER, Tidy } from './tidy';
import { friendship, Mood } from './mood';
import { LOCALE, SPEAK, type BrainChoice, type BrainEvent, type Lang, type BrainStatus, type Command, type Humor, type MailSettings, type Memory, type PrefsAction, type PrefsState, type Settings, type Task, type SettingsTab, type ProjectOp } from '../shared/types';

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let settings: Settings;
let brain: Brain;
let memory: MemoryStore;
let projects: ProjectStore;
let assistant: Assistant;
let watcher: ScreenWatcher;
const music = new Music();
let journal: Journal;
let focus: Focus;
let clip: ClipboardHelper;
let badges: MessageBadges;
let mood: Mood;
let lastMusicComment = 0;
/** Visio ou présentation en cours : Gilbert se tait de lui-même */
let meeting = false;

function send(cmd: Command) {
  win?.webContents.send('command', cmd);
}

function fitToScreen() {
  if (!win) return;
  win.setBounds(screen.getPrimaryDisplay().workArea);
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    ...workArea,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // Gilbert ne vole pas le focus à l'appli en cours quand on clique dessus
    focusable: false,
    alwaysOnTop: true,
    acceptFirstMouse: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win?.showInactive());
}

// ---------- réglages ----------

function update(patch: Partial<Settings>) {
  settings = { ...settings, ...patch };
  saveSettings(settings, true);
  send({ type: 'settings', settings });
  brain?.setPersona({ lang: settings.lang, humor: settings.humor });
  refreshTray();
  refreshPrefs();
}

/** Les trois cerveaux qu'on peut choisir, dans l'ordre léger, équilibré, puissant */
function brainChoices(): BrainChoice[] {
  return [...MODELS].reverse().map((m) => ({
    id: m.id, tier: m.tier, label: m.label, size: m.size, minRamGB: m.minRamGB,
    downloaded: isDownloaded(m), active: brain.info.id === m.id, recommended: recommended().id === m.id,
    pulling: brain.pulling?.id === m.id ? brain.pulling.progress : null,
  }));
}

/** Ce que l'onglet Réglages affiche */
function prefsState(): PrefsState {
  const st = assistant?.status();
  return {
    settings, quiet: isQuiet(), vision: { supported: visionSupported(), permission: permission() },
    brain: brain.status, brains: brainChoices(), ramGB: Math.round(ramGB()), mail: st?.mail.state === 'on', calendar: st?.calendar.state === 'on',
    city: Boolean(memory.data.profile.city), focusEnds: focus?.active?.endsAt ?? 0,
    today: assistant?.today() ?? { name: '', weather: '', events: [], tasks: [], waiting: [] },
    wallet: journal?.wallet ?? { acorns: 0 },
  };
}

/** La fenêtre de Gilbert suit ce qui change (cerveau, connexions, session…) */
function refreshPrefs() {
  pageWindow('settings')?.webContents.send('prefs:change', prefsState());
}

function isQuiet() {
  return settings.quietUntil > Date.now();
}

function setQuiet(until: number) {
  update({ quietUntil: until });
  send({ type: 'quiet', on: until > Date.now() });
  // fin du Chut : ce qui attendait peut être dit
  if (until <= Date.now()) assistant?.wake();
}

// ---------- vision : il regarde l'écran de temps en temps ----------

/** Le texte dans la langue de Gilbert */
const say3 = (fr: string, en: string, vi: string) => ({ fr, en, vi })[settings.lang];

function setVision(on: boolean) {
  update({ vision: on });
  watcher.setEnabled(on);
  if (!on) return;
  const p = permission();
  if (p === 'granted') {
    assistant.tell(say3(
      'Ça marche. Je garde un œil ouvert, et je ne garde rien de ce que je vois.',
      "Deal. I'll keep an eye out, and I won't keep anything I see.",
      'Được thôi. Tớ sẽ để mắt, và không giữ lại gì tớ thấy.'));
    return;
  }
  // Mac : il faut l'autoriser dans les réglages, puis le relancer
  askPermission().then(() => {
    assistant.tell(say3(
      'Laisse-moi entrer : Réglages Système, Confidentialité et sécurité, Enregistrement de l’écran. Puis relance-moi.',
      'Let me in: System Settings, Privacy & Security, Screen Recording. Then restart me.',
      'Cho tớ vào nhé: Cài đặt hệ thống, Quyền riêng tư & Bảo mật, Ghi màn hình. Rồi mở lại tớ.'));
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  });
}

/**
 * Une fonction du guide a vraiment servi (pas seulement « Essayer ») : sa récompense se débloque.
 * Il le dit une fois, discrètement.
 */
function markTried(key: string) {
  if (settings.tried.includes(key)) return;
  update({ tried: [...settings.tried, key] });
  send({ type: 'offer', id: `tried-${key}`, text: say3('Récompense débloquée : 10 glands t’attendent dans le guide.', 'Reward unlocked: 10 acorns are waiting in the guide.', 'Mở khóa phần thưởng: 10 quả sồi đang chờ trong hướng dẫn.'), actions: [], ttl: 5000 });
}

/** Il porte ce pelage, ou cet accessoire (celui qu'il porte déjà se retire) */
function wear(id: string) {
  const item = itemById(id);
  if (!item || !settings.owned.includes(id)) return;
  const skin = item.kind === 'fur'
    ? { ...settings.skin, fur: id }
    : { ...settings.skin, accessory: settings.skin.accessory === id ? '' : id };
  update({ skin });
}

/** Découpe une tâche de ta liste en étapes (il réfléchit pendant ce temps) ; renvoie le nombre d'étapes */
async function splitIntoSteps(task: Task) {
  send({ type: 'thinking', on: true });
  const steps = await splitTask(brain, task.title, settings.lang).catch(() => []);
  send({ type: 'thinking', on: false });
  for (const title of steps) assistant.tasks.add({ title, due: '', time: '', source: 'list', parent: task.id });
  return steps.length;
}

/** « Essayer » dans le guide : il regarde la fenêtre que tu lui montres (ou demande la permission) */
function tryVision() {
  if (!visionSupported()) {
    assistant.tell(say3('Je ne sais pas encore lire l’écran sur ce système.', 'I can’t read the screen on this system yet.', 'Tớ chưa đọc được màn hình trên hệ thống này.'));
    return;
  }
  if (!settings.vision || permission() !== 'granted') return setVision(true);
  assistant.tell(say3(
    'Va sur la fenêtre de ton choix : je regarde dans 5 secondes.',
    "Switch to any window: I'll look in 5 seconds.",
    'Chuyển sang cửa sổ cậu muốn: 5 giây nữa tớ nhìn.'), undefined, undefined, true);
  setTimeout(() => watcher.tryNow().then(() => markTried('vision')).catch(() => {}), 6000);
}

/** Une seule fois, après le premier brief : il propose de montrer ce qu'il sait faire */
function offerGuide() {
  if (settings.guided || brain.status.state !== 'ready') return;
  update({ guided: true });
  assistant.tell(
    say3('Je te montre ce que je sais faire ? Deux minutes, promis.', 'Want me to show you what I can do? Two minutes, promise.', 'Để tớ chỉ cậu tớ làm được gì nhé? Hai phút thôi.'),
    [{ label: say3('Montre-moi', 'Show me', 'Chỉ tớ đi'), value: 'yes' }, { label: say3('Plus tard', 'Later', 'Để sau'), value: 'no' }],
    (v) => {
      if (v === 'yes') openSettings('guide');
      else assistant.tell(say3('D’accord. Le guide est dans « Ouvrir Gilbert », dans la barre des menus.', 'Sure. The guide is under "Open Gilbert" in the menu bar.', 'Được. Hướng dẫn nằm trong « Mở Gilbert » trên thanh menu.'));
    },
  );
}

// ---------- carnet de bord ----------

/** Chaque minute où tu es devant l'écran : l'appli au premier plan est notée dans le carnet */
/** Pendant une session de travail : dix minutes sur un site ou une appli de ta liste de distractions, et il te le dit */
function startDistractionWatch() {
  let ticks = 0, quietUntil = 0;
  setInterval(async () => {
    const list = memory.data.distractions;
    if (!focus?.active || !list.length || powerMonitor.getSystemIdleTime() > 60) { ticks = 0; return; }
    const w = await frontWindow();
    const hay = w && w.pid !== process.pid ? `${w.app} ${w.title}`.toLowerCase() : '';
    const hit = hay && list.find((d) => hay.includes(d.toLowerCase()));
    if (!hit) { ticks = 0; return; }
    if (++ticks < 20 || Date.now() < quietUntil) return;
    ticks = 0;
    quietUntil = Date.now() + 15 * 60_000;
    assistant.tell(
      say3(`Ça fait 10 minutes sur « ${hit} » pendant ta session. On s'y remet, ou on arrête là ?`, `That's 10 minutes on "${hit}" during your session. Back to work, or stop here?`, `Đã 10 phút trên « ${hit} » trong lúc làm việc. Làm tiếp hay dừng ở đây?`),
      [{ label: say3('On s’y remet', 'Back to work', 'Làm tiếp'), value: 'go' }, { label: say3('J’arrête la session', 'End the session', 'Dừng phiên'), value: 'stop' }],
      (v) => { if (v === 'stop') focus.stop(); },
      true,
    );
  }, 30_000);
}

function startJournal() {
  setInterval(async () => {
    if (!settings.journal || powerMonitor.getSystemIdleTime() > 60) return;
    const w = await frontWindow();
    if (w && w.pid !== process.pid) journal.addAppMinute(w.app);
  }, 60_000);
  setTimeout(() => logbook().catch(() => {}), 3 * 60_000);
  setInterval(() => logbook().catch(() => {}), 10 * 60_000);
}

let writingLogbook = false;

/** La note du soir (à partir de 19 h, et celles des jours précédents qui manquent) et le résumé de la semaine */
async function logbook() {
  if (!settings.journal || brain.status.state !== 'ready' || writingLogbook) return;
  writingLogbook = true;
  try {
    const now = new Date();
    const keys = [1, 2, 3].map((n) => isoDay(new Date(now.getTime() - n * 86_400_000)));
    if (now.getHours() >= 19) keys.unshift(isoDay(now));
    for (const key of keys) {
      const day = journal.data.days[key];
      if (!day || day.note || dayIsEmpty(day)) continue;
      const note = await writeDayNote(brain, journal, key, settings.lang);
      if (note) journal.setNote(key, note);
    }
    // la semaine : le vendredi à partir de 17 h, ou en début de semaine suivante si on l'a ratée
    const friday = now.getDay() === 5 && now.getHours() >= 17;
    const weekend = now.getDay() === 6 || now.getDay() === 0;
    const monday = friday || weekend ? weekOf(now) : weekOf(new Date(now.getTime() - 7 * 86_400_000));
    if (monday in journal.data.weeks || (!friday && !weekend && now.getDay() > 3)) return;
    const bubbles = await writeWeek(brain, journal, monday, settings.lang);
    journal.setWeek(monday, bubbles?.join('\n') ?? '');
    if (bubbles && !isQuiet()) assistant.tellBubbles(bubbles);
  } finally {
    writingLogbook = false;
  }
}

// ---------- rangement des Téléchargements ----------

let tidy: Tidy;

/** Toutes les 6 h : si les Téléchargements débordent, il propose de ranger (il ne fait rien sans « Ranger ») */
function checkDownloads(now = false) {
  if (!now && (!settings.tidy || isQuiet() || focus.active || powerMonitor.getSystemIdleTime() > 60)) return;
  const p = tidy.proposal(Date.now(), now);
  if (!p) {
    if (now) markTried('tidy');
    if (now) assistant.tell(say3('Rien qui traîne dans tes Téléchargements. Bravo, c’est rare.', 'Nothing lying around in your Downloads. Well done, that’s rare.', 'Thư mục Tải về gọn gàng. Giỏi đấy, hiếm lắm.'));
    return;
  }
  const detail = p.counts.slice(0, 3).map(([k, n]) => `${n} ${FOLDER[k][settings.lang].toLowerCase()}`).join(', ');
  assistant.tell(
    say3(`Tes Téléchargements débordent : ${p.total} fichiers qui traînent (${detail}…). Je les range par type, dans des sous-dossiers ?`,
      `Your Downloads are overflowing: ${p.total} files lying around (${detail}…). Shall I sort them by type into subfolders?`,
      `Thư mục Tải về đầy rồi: ${p.total} tệp nằm đó (${detail}…). Tớ xếp theo loại vào các thư mục con nhé?`),
    [{ label: say3('Ranger', 'Sort them', 'Xếp đi'), value: 'tidy' }, { label: say3('Voir le dossier', 'Show folder', 'Xem thư mục'), value: 'open' }, { label: say3('Pas maintenant', 'Not now', 'Để sau'), value: 'no' }],
    (v) => {
      if (v === 'open') shell.openPath(tidy.folder);
      if (v !== 'tidy') return;
      const r = tidy.run(settings.lang);
      markTried('tidy');
      assistant.tell(
        say3(`Rangé : ${r.moved} fichiers dans ${r.folders} dossiers. Rien n'est supprimé.`, `Done: ${r.moved} files in ${r.folders} folders. Nothing deleted.`, `Xong: ${r.moved} tệp vào ${r.folders} thư mục. Không xóa gì cả.`),
        [{ label: say3('Annuler', 'Undo', 'Hoàn tác'), value: 'undo' }, { label: say3('Ouvrir', 'Open', 'Mở'), value: 'open' }],
        (w) => {
          if (w === 'open') shell.openPath(tidy.folder);
          if (w === 'undo') {
            const n = tidy.undo();
            assistant.tell(say3(`C'est remis comme avant (${n} fichiers).`, `Back the way it was (${n} files).`, `Đã trả lại như cũ (${n} tệp).`));
          }
        },
      );
    },
  );
}

// ---------- musique ----------

/** Probabilité de commenter un nouveau morceau, et écart minimal entre deux remarques */
const MUSIC_TASTE: Record<Humor, { chance: number; gap: number }> = {
  sober: { chance: 0, gap: Infinity },
  normal: { chance: 0.2, gap: 25 * 60_000 },
  unbearable: { chance: 0.45, gap: 10 * 60_000 },
};

/** Nouveau morceau lancé (pas par lui) : de temps en temps, il commente ton choix */
async function commentTrack(t: Track) {
  const taste = MUSIC_TASTE[settings.humor];
  if (!settings.musicComments || isQuiet() || meeting || focus.active || brain.status.state !== 'ready') return;
  if (powerMonitor.getSystemIdleTime() > 60 || Date.now() - lastMusicComment < taste.gap || Math.random() > taste.chance) return;
  lastMusicComment = Date.now();
  const en = settings.lang !== 'fr';
  const what = describe(t, settings.lang) + (t.album && t.album !== t.title ? (en ? `, from the album "${t.album}"` : `, de l’album « ${t.album} »`) : '');
  const time = new Date().toLocaleTimeString(LOCALE[settings.lang], { hour: '2-digit', minute: '2-digit' });
  const out = await brain.compose(en
    ? `It is ${time}. Your human just started listening to ${what}. In one sentence of at most 15 words, ${SPEAK[settings.lang]}, make a teasing but friendly remark about this music choice. If you don't know the song, don't pretend: play on the title or the artist's name. Don't start with "Looks like".`
    : `Il est ${time}. Ton humain vient de lancer ${what}. En une phrase de 15 mots maximum, fais une remarque taquine mais bienveillante sur ce choix musical. Si tu ne connais pas ce morceau, ne fais pas semblant : joue sur le titre ou le nom de l’artiste. Ne commence pas par « On dirait ».`, 60);
  const line = out?.split('\n').map((l) => l.trim().replace(/^["«]\s*|\s*["»]$/g, '')).find(Boolean);
  if (line) assistant.tell(line);
}

/** Commande de la discussion ou du menu ; « play »/« pause » ne basculent que si besoin */
async function musicCommand(cmd: 'status' | 'play' | 'pause' | 'next' | 'previous') {
  if (cmd === 'play' || cmd === 'pause') {
    const now = await music.run('status');
    if (now.player && now.playing === (cmd === 'pause')) return music.run('playpause');
    return now;
  }
  return music.run(cmd);
}

function tomorrowMorning() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d.getTime();
}

// ---------- menu (barre des menus et clic droit sur Gilbert) ----------

function buildMenu() {
  const quiet = isQuiet();
  const hm = (t: number) => new Date(t).toLocaleTimeString(LOCALE[settings.lang], { hour: '2-digit', minute: '2-digit' });
  const missing = brain.status.state === 'missing' || brain.status.state === 'error';
  // l'essentiel du quotidien ; tout le reste est dans la fenêtre de Gilbert
  const template: MenuItemConstructorOptions[] = [
    { label: statusLabel(), enabled: false },
    ...(missing ? [{ label: brainLabel(brain.status), click: () => brain.download() }] : []),
    { type: 'separator' },
    { label: say3('Lui parler', 'Talk to him', 'Nói chuyện'), enabled: brain.status.state === 'ready', click: () => send({ type: 'chat' }) },
    { label: say3('Brief du jour', 'Daily brief', 'Bản tin hôm nay'), enabled: !quiet, click: () => assistant.runBrief(true) },
    focus?.active
      ? { label: say3(`Arrêter la session (fin à ${hm(focus.active.endsAt)})`, `Stop the session (ends ${hm(focus.active.endsAt)})`, `Dừng buổi làm việc (kết thúc ${hm(focus.active.endsAt)})`), click: () => focus.stop() }
      : { label: say3('Session de travail', 'Work session', 'Buổi làm việc'), submenu: [25, 50].map((m) => ({ label: `${m} min`, click: () => focus.start(m) })) },
    quiet
      ? { label: say3('Tu peux reparler', 'You can talk again', 'Nói lại được rồi'), click: () => setQuiet(0) }
      : {
        label: say3('Chut', 'Quiet', 'Suỵt'),
        submenu: [
          { label: say3('Pendant 1 heure', 'For 1 hour', 'Trong 1 giờ'), click: () => setQuiet(Date.now() + 3600_000) },
          { label: say3("Jusqu'à demain matin", 'Until tomorrow morning', 'Đến sáng mai'), click: () => setQuiet(tomorrowMorning()) },
        ],
      },
    { type: 'separator' },
    { label: say3('Ouvrir Gilbert…', 'Open Gilbert…', 'Mở Gilbert…'), click: () => openSettings('home') },
    { label: say3('Réglages…', 'Settings…', 'Cài đặt…'), click: () => openSettings('general') },
    { type: 'separator' },
    { label: say3('Quitter Gilbert', 'Quit Gilbert', 'Thoát Gilbert'), click: () => app.quit() },
  ];
  return Menu.buildFromTemplate(template);
}

/** La première ligne du menu : ce qu'il fait en ce moment */
function statusLabel() {
  const hm = (t: number) => new Date(t).toLocaleTimeString(LOCALE[settings.lang], { hour: '2-digit', minute: '2-digit' });
  if (focus?.active) return say3(`Gilbert · en session jusqu'à ${hm(focus.active.endsAt)}`, `Gilbert · working until ${hm(focus.active.endsAt)}`, `Gilbert · làm việc đến ${hm(focus.active.endsAt)}`);
  if (isQuiet()) return say3(`Gilbert · se tait jusqu'à ${hm(settings.quietUntil)}`, `Gilbert · quiet until ${hm(settings.quietUntil)}`, `Gilbert · im lặng đến ${hm(settings.quietUntil)}`);
  if (meeting) return say3('Gilbert · se tait (visio en cours)', 'Gilbert · quiet (call in progress)', 'Gilbert · im lặng (đang họp)');
  if (brain.status.state === 'downloading') return say3(`Gilbert · cerveau ${Math.round(brain.status.progress * 100)} %`, `Gilbert · brain ${Math.round(brain.status.progress * 100)}%`, `Gilbert · bộ não ${Math.round(brain.status.progress * 100)} %`);
  if (brain.status.state === 'loading') return say3('Gilbert · se réveille…', 'Gilbert · waking up…', 'Gilbert · đang thức dậy…');
  return 'Gilbert';
}

function brainLabel(s: BrainStatus) {
  const go = (n: number) => `${(n / 1e9).toFixed(1).replace('.', settings.lang === 'en' ? '.' : ',')} ${settings.lang === 'fr' ? 'Go' : 'GB'}`;
  switch (s.state) {
    case 'missing': return say3(`Télécharger son cerveau (${go(s.size)})`, `Download his brain (${go(s.size)})`, `Tải bộ não (${go(s.size)})`);
    case 'downloading': return say3(`Cerveau : téléchargement ${Math.round(s.progress * 100)} %`, `Brain: downloading ${Math.round(s.progress * 100)}%`, `Bộ não: đang tải ${Math.round(s.progress * 100)} %`);
    case 'loading': return say3('Cerveau : réveil en cours…', 'Brain: waking up…', 'Bộ não: đang thức dậy…');
    case 'ready': return say3(`Cerveau : ${s.model}, prêt`, `Brain: ${s.model}, ready`, `Bộ não: ${s.model}, sẵn sàng`);
    case 'error': return say3(`Cerveau : erreur (${s.message}). Réessayer`, `Brain: error (${s.message}). Retry`, `Bộ não: lỗi (${s.message}). Thử lại`);
  }
}

let trayTimer: NodeJS.Timeout | null = null;

function refreshTray() {
  tray?.setContextMenu(buildMenu());
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(app.getAppPath(), 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('Gilbert');
  refreshTray();
}

// ---------- IPC ----------

// le premier lancement de l'appli installée (installeur rangé, poubelle posée) passe avant
let installing: Promise<void> = Promise.resolve();
/** Cette fois, l'appli vient de s'installer : macOS demande la permission du Finder, on lui laisse le temps */
let justInstalled = false;
ipcMain.handle('home:get', () => installing.then(() => desktopHome(justInstalled ? 90_000 : 4000)).catch(() => null));

ipcMain.handle('settings:get', () => settings);
ipcMain.handle('brief:pending', () => assistant?.briefPending ?? false);
ipcMain.on('brief:replay', () => assistant.runBrief(true));
// notes vocales : le micro (macOS demande l'autorisation une fois), puis Whisper sur la machine
ipcMain.handle('voice:permission', async () => (process.platform === 'darwin' ? systemPreferences.askForMediaAccess('microphone') : true));
ipcMain.handle('voice:transcribe', async (_e, pcm: Float32Array) => {
  let shown = -1;
  return transcribe(pcm, settings.lang, (p) => {
    const pct = Math.floor(p * 100);
    if (pct === shown || pct % 5) return;
    shown = pct;
    send({ type: 'offer', id: 'voice-download', text: say3(`Je télécharge mes oreilles (une seule fois) : ${pct} %`, `Downloading my ears (just once): ${pct}%`, `Tớ đang tải đôi tai (chỉ một lần): ${pct} %`), actions: [], ttl: 8000 });
  });
});
ipcMain.on('played', (_e, kind: 'click' | 'throw' | 'chat') => { if (settings.moods) mood.played(kind); });
ipcMain.on('focus', (_e, m: number | 'stop') => (m === 'stop' ? focus.stop() : focus.start(Math.min(Math.max(Number(m) || 25, 5), 120))));
ipcMain.handle('music', (_e, cmd: 'status' | 'play' | 'pause' | 'next' | 'previous') => {
  markTried('music');
  return musicCommand(cmd);
});
// ce que seul Gilbert voit : on l'a fait descendre en tirant sa queue
ipcMain.on('tried', (_e, key: string) => { if (key === 'hide') markTried('hide'); });
/** Où est la fenêtre de Gilbert, et quel onglet y est affiché : il s'assoit sur son bord du haut, ou sur la branche pour discuter */
let settingsBounds: Electron.Rectangle | null = null;
let settingsTab: SettingsTab = 'home';
function perchOnSettings() {
  const b = settingsBounds, area = screen.getPrimaryDisplay().workArea;
  if (!b) return send({ type: 'perch', at: null });
  // le panneau est à 6 px du bord de la fenêtre (sa bordure pixel déborde de 3 px)
  // la Discussion : il se tient à gauche du fil, au centre de sa colonne
  if (settingsTab === 'chat') {
    const x = b.x - area.x + 6 + MENU.rail + 20;
    send({ type: 'perch', at: { x, y: b.y - area.y + b.height - 6 - MENU.floor, width: MENU.chatColumn, spot: x + MENU.chatColumn / 2 + 14 } });
  }
  else send({ type: 'perch', at: { x: b.x - area.x + 6, y: b.y - area.y + 4, width: b.width - 12 } });
}
ipcMain.on('prefs:shown', (_e, tab: SettingsTab) => {
  // il ne bouge que de l'onglet Discussion (où il s'installe en bas à gauche) vers les autres, et inversement
  const was = settingsTab === 'chat';
  settingsTab = tab;
  if ((tab === 'chat') !== was) perchOnSettings();
});
ipcMain.handle('acorns:pending', () => journal?.pending ?? { acorns: 0 });
ipcMain.on('acorns:collect', (_e, acorns: unknown) => journal?.collect(Number(acorns) || 0));
ipcMain.on('mouse:ignore', (_e, ignore: boolean) => win?.setIgnoreMouseEvents(ignore, { forward: true }));
ipcMain.on('menu:show', () => win && buildMenu().popup({ window: win }));
ipcMain.on('settings:position', (_e, x: number) => {
  settings.x = Math.round(x);
  saveSettings(settings);
});
ipcMain.on('window:focus', (_e, on: boolean) => {
  if (!win) return;
  win.setFocusable(on);
  if (on) {
    app.focus({ steal: true });
    win.focus();
  } else if (process.platform !== 'darwin') {
    // sur Mac, blur() renvoie la fenêtre tout au fond : Gilbert disparaissait un instant.
    // Rendre la fenêtre non « focusable » suffit, le clavier repart au prochain clic ailleurs.
    win.blur();
  }
});

ipcMain.handle('brain:status', () => brain.status);
ipcMain.handle('brain:models', () => brainChoices());
ipcMain.on('brain:use', (_e, id: string) => {
  if (!MODELS.some((m) => m.id === id)) return;
  update({ brainModel: id });
  brain.use(id);
});

ipcMain.handle('memory:get', () => memory.data);
ipcMain.on('intro:done', (_e, answers: Partial<Memory['profile']>) => memory.finishOnboarding(answers));
ipcMain.on('settings:open', (_e, tab?: SettingsTab) => openSettings(tab ?? 'home'));
ipcMain.handle('prefs:get', () => prefsState());
ipcMain.handle('journal:get', () => journal.data);
ipcMain.on('prefs:resize', (e, width: number, height: number) => {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return;
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && !w.isDestroyed()) w.setSize(Math.round(width), Math.round(height));
});
ipcMain.on('prefs:move', (e, x: number, y: number) => {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && !w.isDestroyed()) w.setPosition(Math.round(x), Math.round(y));
});
ipcMain.on('prefs:set', (_e, patch: Partial<Settings>) => {
  // la vision passe par sa propre mise en route (permission, message de Gilbert)
  const { vision, ...rest } = patch;
  if (Object.keys(rest).length) update(rest);
  if (rest.messages !== undefined) badges.setEnabled(rest.messages);
  if (rest.mailPrimaryOnly !== undefined) assistant.mail.primaryOnly = rest.mailPrimaryOnly;
  if (vision !== undefined && vision !== settings.vision) setVision(vision);
});
/** Ce qui le fait parler ou agir à l'écran : il descend d'abord de la fenêtre (sinon elle cache sa bulle) */
const ON_SCREEN: PrefsAction[] = ['say', 'brief', 'evening', 'tryClipboard', 'tryVision', 'tidyNow', 'hide', 'focusStart'];

ipcMain.on('prefs:action', (_e, a: PrefsAction, arg?: string) => {
  if (ON_SCREEN.includes(a)) {
    const b = pageWindow('settings')?.getBounds(), area = screen.getPrimaryDisplay().workArea;
    if (b) send({ type: 'aside', x0: b.x - area.x, x1: b.x - area.x + b.width });
  }
  if (a === 'tidyNow') checkDownloads(true);
  if (a === 'openData') shell.openPath(app.getPath('userData'));
  if (a === 'downloadBrain') brain.download();
  if (a === 'useBrain' && arg && MODELS.some((m) => m.id === arg)) {
    update({ brainModel: arg });
    brain.use(arg);
  }
  if (a === 'focusStop') focus.stop();
  if (a === 'brief') assistant.runBrief(true);
  if (a === 'focusStart') focus.start(Math.min(Math.max(Math.round(Number(arg) || 25), 5), 120));
  if (a === 'say') send({ type: 'chat', text: arg, fill: true });
  // la liste de choses à faire (Aujourd'hui)
  const json = <T>() => { try { return JSON.parse(arg ?? '') as T; } catch { return null; } };
  if (a === 'taskAdd') {
    const t = json<{ title: string; due: string }>();
    if (t?.title?.trim()) markTried('list');
    if (t?.title?.trim()) assistant.tasks.add({ title: t.title.trim().slice(0, 200), due: /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : '', time: '', source: 'list' });
  }
  if (a === 'taskEdit') {
    const t = json<{ id: string; title?: string; due?: string }>();
    if (t?.id) assistant.tasks.edit(t.id, t);
  }
  if (a === 'taskDone' && arg) assistant.tasks.done(arg);
  if (a === 'taskUndo' && arg) {
    const t = assistant.tasks.tasks.find((x) => x.id === arg);
    assistant.tasks.reopen(arg);
    if (t && settings.journal) journal.taskUndone(t.title);
  }
  if (a === 'taskRemove' && arg) assistant.tasks.remove(arg);
  if (a === 'taskSplit' && arg) {
    const t = assistant.tasks.tasks.find((x) => x.id === arg);
    if (t && !assistant.tasks.steps(t.id).length && brain.status.state === 'ready') {
      splitIntoSteps(t).then((n) => n || assistant.tell(say3('Je n’arrive pas à la découper, celle-là.', 'I can’t break that one down.', 'Việc này tớ không chia nhỏ được.')));
    }
  }
  if (a === 'tryClipboard') clip.demo();
  if (a === 'tryVision') tryVision();
  if (a === 'hide') send({ type: 'hide' });
  // la boutique : payer, puis le porter tout de suite (il te le fait remarquer)
  if (a === 'buy' && arg) {
    const item = itemById(arg);
    if (item && !settings.owned.includes(arg) && journal.spend(item.price)) {
      update({ owned: [...settings.owned, arg] });
      wear(arg);
      assistant.tell(say3('Merci ! Alors, ça me va bien ?', 'Thank you! So, does it suit me?', 'Cảm ơn! Tớ mặc có hợp không?'), undefined, undefined, true);
    }
  }
  if (a === 'wear' && arg) wear(arg);
  // les 10 glands d'un essai du guide, ramassés une seule fois
  if (a === 'collect' && arg && settings.tried.includes(arg) && !settings.collected.includes(arg)) {
    update({ collected: [...settings.collected, arg] });
    journal.addAcorns(10);
  }
  if (a === 'evening') {
    assistant.evening().then((said) => said ? markTried('evening') : assistant.tell(say3(
      'Pas encore grand-chose à raconter sur ta journée. Repose-moi la question ce soir !',
      'Not much to say about your day yet. Ask me again tonight!',
      'Hôm nay chưa có gì nhiều để kể. Tối hỏi lại tớ nhé!'), undefined, undefined, true));
  }
});
ipcMain.handle('carnet:get', () => ({ memory: memory.data, lang: settings.lang }));

ipcMain.handle('connections:get', () => ({ lang: settings.lang, ...assistant.settings(), status: assistant.status() }));
ipcMain.handle('connections:saveMail', (_e, m: MailSettings & { password: string }) => assistant.saveMail(m));
ipcMain.on('connections:disconnectMail', () => assistant.disconnectMail());
ipcMain.handle('connections:saveCalendar', (_e, url: string, auth?: { user: string; password: string }) => assistant.saveCalendar(url, auth));
ipcMain.on('connections:disconnectCalendar', () => assistant.disconnectCalendar());
ipcMain.on('connections:open', (_e, url: string) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
ipcMain.on('notify:answer', (_e, id: string, value: string) => { if (!clip?.answer(id, value)) assistant.answer(id, value); });
ipcMain.on('carnet:save', (_e, m: Memory) => memory.replace(m));
ipcMain.on('carnet:forget', () => memory.forgetAll());

// ---------- les projets ----------

const projectSources = (): Sources => ({ mails: assistant.mailbox.mails, events: assistant.calendar.events, lang: settings.lang });
ipcMain.handle('projects:get', () => ({
  projects: projects.views(projectSources()),
  categories: [...new Set(projects.projects.map((p) => p.category).filter(Boolean))],
  lang: settings.lang,
}));
ipcMain.on('projects:act', (_e, op: ProjectOp) => {
  switch (op?.type) {
    case 'add': projects.add(String(op.name ?? ''), String(op.category ?? ''), String(op.keywords ?? ''), String(op.description ?? '')); break;
    case 'edit': projects.edit(String(op.id), op.patch ?? {}); break;
    case 'remove': projects.remove(String(op.id)); break;
    case 'report': void writeReport(String(op.id), true); break;
    case 'todoAdd': projects.addTodo(String(op.id), String(op.text ?? ''), String(op.due ?? '')); break;
    case 'todoEdit': projects.editTodo(String(op.id), String(op.todoId), op.patch ?? {}); break;
    case 'todoRemove': projects.removeTodo(String(op.id), String(op.todoId)); break;
    case 'noteRemove': projects.removeNote(String(op.id), String(op.noteId)); break;
    case 'dismiss': projects.dismiss(String(op.adviceId)); break;
    case 'draft': void draftFor(String(op.id), String(op.adviceId)); break;
  }
});

/** Le rapport d'avancement est réécrit par Gilbert, tant que tu n'y as pas touché (ou si tu le lui demandes) */
const reportTimers = new Map<string, NodeJS.Timeout>();
function scheduleReport(id: string) {
  clearTimeout(reportTimers.get(id));
  reportTimers.set(id, setTimeout(() => { reportTimers.delete(id); void writeReport(id, false); }, 30_000));
}
async function writeReport(id: string, asked: boolean) {
  const p = projects.get(id);
  if (!p || (!asked && !p.progressAuto) || brain.status.state !== 'ready') return;
  const text = await projectReport(brain, p, settings.lang).catch(() => null);
  if (text) projects.setReport(id, text);
}

/** Un mail important qui ne ressemble à aucune fiche : si le même sujet revient, il propose d'en créer une */
async function suggestProject(m: { from: string; subject: string; date: number }, summary: string) {
  if (brain.status.state !== 'ready') return;
  const idea = await projectIdea(brain, { from: m.from, subject: m.subject, summary }, settings.lang).catch(() => null);
  if (!idea) return;
  const hit = projects.idea(idea.name, idea.keywords, { text: `${m.from} : ${summary}`, at: m.date });
  if (!hit) return;
  projects.markIdea(hit.key, 'asked');
  assistant.tell(
    say3(`Je vois revenir des mails sur « ${hit.idea.name} ». Je crée une fiche projet ?`, `I keep seeing emails about "${hit.idea.name}". Shall I create a project sheet?`, `Tớ thấy nhiều email về « ${hit.idea.name} ». Tạo hồ sơ dự án nhé?`),
    [{ label: say3('Créer la fiche', 'Create it', 'Tạo hồ sơ'), value: 'yes' }, { label: say3('Non merci', 'No thanks', 'Thôi khỏi'), value: 'no' }],
    (v) => {
      if (v === 'yes') {
        const p = projects.createFromIdea(hit.key);
        if (p) assistant.tell(say3(`C'est fait : « ${p.name} » est dans l'onglet Projets.`, `Done: "${p.name}" is in the Projects tab.`, `Xong: « ${p.name} » đã có trong tab Dự án.`));
      } else projects.markIdea(hit.key, 'declined');
    },
  );
}

/** Ce que Gilbert voit à l'écran : si cela concerne un projet suivi, c'est noté (au plus une fois par quart d'heure et par projet) */
const lastLook = new Map<string, number>();
async function lookAtScreen(w: { app: string; title: string; text: string }) {
  if (!settings.projectScreen) return;
  for (const p of projects.about(`${w.app} ${w.title} ${w.text.slice(0, 1500)}`).slice(0, 1)) {
    projects.touch(p.id);
    if (Date.now() - (lastLook.get(p.id) ?? 0) < 15 * 60_000 || brain.status.state !== 'ready') continue;
    lastLook.set(p.id, Date.now());
    const r = await screenInsight(brain, p, w, settings.lang).catch(() => null);
    if (!r) continue;
    if (r.info.length >= 12) projects.addNote(p.id, r.info, 'screen');
    if (r.todo.length >= 6) projects.addTodo(p.id, r.todo, r.date, true);
  }
}

/** Rédige le brouillon d'une recommandation (réponse ou relance) et le copie, prêt à coller dans le mail */
async function draftFor(id: string, adviceId: string) {
  const p = projects.get(id);
  if (!p) return;
  const src = projectSources();
  const mail = projects.mailFor(adviceId, p, src);
  if (brain.status.state !== 'ready') {
    assistant.tell(say3('Mon cerveau n’est pas prêt : je ne peux pas rédiger ça pour l’instant.', 'My brain isn’t ready: I can’t draft that right now.', 'Bộ não chưa sẵn sàng nên tớ chưa soạn được.'));
    return;
  }
  const fr = settings.lang === 'fr';
  const who = mail?.from ?? '';
  const task = (fr
    ? [`Rédige un court mail (3 à 5 phrases, poli, direct, sans objet ni formule de politesse longue) de la part de ton humain, ${adviceId.startsWith('reply:') ? 'pour répondre' : 'pour relancer'}${who ? ` à ${who}` : ''}, à propos du projet « ${p.name} ».`,
      mail ? `Dernier mail reçu : ${mail.summary || mail.subject}` : '', p.progress ? `Où en est le projet : ${p.progress}` : '',
      ...p.notes.slice(0, 3).map((n) => `Note : ${n.text}`), 'N’invente aucun fait, aucune date, aucun chiffre ; laisse [à compléter] si une information manque. Écris uniquement le texte du mail.']
    : [`Write a short email (3 to 5 sentences, polite, direct, no subject line, no long sign-off) on behalf of your human, ${adviceId.startsWith('reply:') ? 'replying' : 'following up'}${who ? ` to ${who}` : ''}, about the project "${p.name}".`,
      mail ? `Last email received: ${mail.summary || mail.subject}` : '', p.progress ? `Project status: ${p.progress}` : '',
      ...p.notes.slice(0, 3).map((n) => `Note: ${n.text}`), 'Do not invent any fact, date or number; write [to complete] if something is missing. Write only the email text.']).filter(Boolean).join('\n');
  const text = await brain.compose(task, 260);
  if (!text) {
    assistant.tell(say3('Je n’ai pas réussi à rédiger ça, désolé.', 'I couldn’t write that, sorry.', 'Tớ soạn không được, xin lỗi.'));
    return;
  }
  clipboard.writeText(text.trim());
  assistant.tell(say3(`Brouillon copié pour « ${p.name} » : relis-le, puis colle-le dans ton mail.`, `Draft copied for "${p.name}": read it over, then paste it into your email.`, `Đã chép bản nháp cho « ${p.name} »: đọc lại rồi dán vào email nhé.`));
}
ipcMain.on('brain:download', () => brain.download());
ipcMain.on('brain:cancel', (_e, id: number) => brain.cancel(id));
ipcMain.on('brain:ask', (_e, id: number, text: string) => {
  answer(id, text, (ev) => win?.webContents.send('brain:event', ev));
});

/** Répond à ce que tu écris, dans la bulle ou dans une discussion longue : `emit` reçoit les morceaux puis la réponse */
/** « note pour Alpha : appeler le client lundi » */
const PROJECT_NOTE = /^\s*(?:gilbert[\s,]*)?(?:note|ajoute(?: une note)?|retiens)\s+(?:pour|sur|dans|for|on|to)\s+(?:le projet\s+|la fiche\s+|project\s+)?(.{2,60}?)\s*:\s*(.{3,})$/i;

/** « crée un projet Alpha » */
const PROJECT_NEW = /^\s*(?:gilbert[\s,]*)?(?:cr[ée]{1,2}e?s?|ajoute|nouveau|create|add|new)\s+(?:un\s+|une\s+|a\s+)?(?:nouveau\s+)?(?:projet|project)\s+(?:nomm[ée]\s+|appel[ée]\s+|called\s+|named\s+)?[«"]?(.{2,60}?)[»"]?\s*$/i;

async function answer(id: number, text: string, emit: (ev: BrainEvent) => void, opts: { history?: { role: 'user' | 'gilbert'; text: string }[]; long?: boolean } = {}) {
  try {
    markTried('chat');
    if (settings.journal) journal.count('chats');
    if (settings.moods) mood.played('chat');
    // il parle de la météo : il va chercher le temps qu'il fait (il est ensuite dans son contexte)
    if (/météo|meteo|weather|thời tiết|pleu|pluie|parapluie|froid|chaud|soleil|neige|rain|umbrella|cold|hot|sunny|snow|mưa|lạnh|nóng|nắng/i.test(text)) {
      await assistant.todayWeather().catch(() => null);
    }
    // « Gilbert, 25 minutes » : une session de travail
    if (FOCUS_START.test(text) && !REMIND.test(text)) {
      markTried('focus');
      const minutes = Focus.minutesIn(text);
      emit({ id, kind: 'done', text: say3(`C'est parti pour ${minutes} minutes. Je bosse avec toi.`, `${minutes} minutes, let's go. I'm working with you.`, `Bắt đầu ${minutes} phút nhé. Tớ làm việc cùng cậu.`) });
      setTimeout(() => focus.start(minutes), 1500);
      return;
    }
    // « ajoute … à ma liste », « c'est fait : … » : la liste, tout de suite
    const toAdd = todoToAdd(text);
    if (toAdd) {
      markTried('list');
      assistant.tasks.add({ title: toAdd.slice(0, 200), due: '', time: '', source: 'list' });
      emit({ id, kind: 'done', text: say3(`C'est sur ta liste : ${toAdd}.`, `It's on your list: ${toAdd}.`, `Đã thêm vào danh sách: ${toAdd}.`) });
      return;
    }
    const toSplit = todoSplit(text);
    if (toSplit) {
      const task = assistant.tasks.find(toSplit) ?? assistant.tasks.add({ title: toSplit.charAt(0).toUpperCase() + toSplit.slice(1, 200), due: '', time: '', source: 'list' });
      const n = assistant.tasks.steps(task.id).length || await splitIntoSteps(task);
      emit({ id, kind: 'done', text: n
        ? say3(`« ${task.title} » en ${n} étapes : c'est dans ta liste.`, `"${task.title}" in ${n} steps: it's on your list.`, `« ${task.title} » chia thành ${n} bước: có trong danh sách rồi.`)
        : say3('Je n’arrive pas à la découper, celle-là.', 'I can’t break that one down.', 'Việc này tớ không chia nhỏ được.') });
      return;
    }
    const finished = todoDone(text);
    const task = finished && assistant.tasks.find(finished);
    if (task) {
      assistant.tasks.done(task.id);
      emit({ id, kind: 'done', text: say3(`Bien joué ! Je coche « ${task.title} ».`, `Nice one! Ticking off "${task.title}".`, `Giỏi lắm! Tớ đánh dấu « ${task.title} » rồi.`) });
      return;
    }
    // « crée un projet Alpha » : une fiche, tout de suite
    const np = text.match(PROJECT_NEW);
    if (np) {
      const p = projects.find(np[1]) ?? projects.add(np[1], '', '', '');
      emit({ id, kind: 'done', text: p
        ? say3(`C'est fait : la fiche « ${p.name} » est dans l'onglet Projets. Ajoute-y ses mots-clés et une description.`, `Done: the "${p.name}" sheet is in the Projects tab. Add its keywords and a description there.`, `Xong: hồ sơ « ${p.name} » đã có trong tab Dự án. Hãy thêm từ khóa và mô tả.`)
        : say3('Je n’ai pas pu créer cette fiche.', 'I couldn’t create that sheet.', 'Tớ không tạo được hồ sơ này.') });
      return;
    }
    // « note pour Alpha : … » : une note dans la fiche du projet
    const pn = text.match(PROJECT_NOTE);
    if (pn) {
      const p = projects.find(pn[1]);
      if (p) projects.addNote(p.id, pn[2], 'chat');
      emit({ id, kind: 'done', text: p
        ? say3(`Noté dans la fiche « ${p.name} ».`, `Added to the "${p.name}" sheet.`, `Đã ghi vào hồ sơ « ${p.name} ».`)
        : say3(`Je ne trouve pas de projet « ${pn[1]} » : crée sa fiche dans l’onglet Projets.`, `I can't find a project "${pn[1]}": create its sheet in the Projects tab.`, `Tớ không thấy dự án « ${pn[1]} »: hãy tạo hồ sơ trong tab Dự án.`) });
      return;
    }
    // « rappelle-moi… » : un rappel, noté tout de suite, sans bavardage
    if (REMIND.test(text)) {
      const r = await parseReminder(brain, text, settings.lang);
      if (r) {
        markTried('remind');
        assistant.tasks.add({ title: r.what, due: r.due, time: r.time, source: 'chat' });
        const what = describeReminder(r, settings.lang);
        emit({ id, kind: 'done', text: say3(`C'est noté : ${what}. Je te ferai signe.`, `Noted: ${what}. I'll give you a shout.`, `Tớ ghi rồi: ${what}. Đến lúc tớ sẽ nhắc.`) });
        return;
      }
    }
    // une question sur ses mails : les mails qui y répondent accompagnent la question (RAG local)
    let prompt = text;
    if (aboutMail(text, assistant.mailbox)) {
      const query = await mailQuery(brain, text);
      const found = query ? assistant.mailbox.search(query, 3) : [];
      if (found.length) markTried('mail');
      if (found.length) prompt = `${mailContext(found, settings.lang)}\n\n${settings.lang === 'fr' ? 'Sa question' : 'Their question'} : ${text}`;
    }
    // une question sur un projet suivi : sa fiche accompagne la question
    if (prompt === text) {
      const mentioned = projects.about(text).slice(0, 2);
      if (mentioned.length) prompt = `${mentioned.map((p) => projects.context(p, projectSources(), settings.lang)).join('\n\n')}\n\n${settings.lang === 'fr' ? 'Sa question' : 'Their question'} : ${text}`;
    }
    // internet : sur demande (« cherche… »), ou quand la question sort de ce qu'il sait (actualité, faits récents)
    let sources: WebResult[] = [];
    if (settings.webSearch && prompt === text) {
      const asked = explicitSearch(text);
      const query = asked ?? (looksLikeLookup(text) ? await webQuery(brain, text) : null);
      if (query) {
        sources = await webSearch(query, settings.lang, 5);
        prompt = sources.length ? webContext(sources, text, settings.lang) : `${text}\n\n${say3('(Je n’ai rien trouvé sur internet : réponds avec ce que tu sais, et dis-le franchement si tu n’es pas sûr.)', '(Nothing found online: answer from what you know, and say so plainly if you are unsure.)', '(Không tìm thấy gì trên mạng: hãy trả lời theo hiểu biết của cậu và nói thật nếu không chắc.)')}`;
      }
    }
    const reply = await brain.ask(id, prompt, (chunk) => emit({ id, kind: 'chunk', text: chunk }), opts);
    // les sites consultés, cités sous la réponse
    const cited = [...new Set(sources.slice(0, 3).map((r) => siteOf(r.url)))];
    emit({ id, kind: 'done', text: cited.length ? `${reply}\n${say3('Sources', 'Sources', 'Nguồn')} : ${cited.join(', ')}` : reply });
    // en tâche de fond : y a-t-il quelque chose à retenir sur toi dans cet échange ?
    learn(brain, memory, text, reply, settings.lang)
      .then((facts) => facts.length && send({ type: 'learned', facts }))
      .catch(() => {});
  } catch (err) {
    emit({ id, kind: 'error', text: (err as Error).message });
  }
}

// ---------- l'onglet Discussion ----------

let chats: ChatStore;
/** Les questions en cours dans l'onglet Discussion : discussion → numéro de la question */
const chatAsks = new Map<string, number>();
let chatAskId = 1_000_000;
ipcMain.handle('chat:list', () => chats.list());
ipcMain.handle('chat:get', (_e, id: string) => chats.get(id));
ipcMain.handle('chat:create', () => chats.create());
ipcMain.on('chat:remove', (_e, id: string) => chats.remove(id));
ipcMain.on('chat:cancel', (_e, id: string) => { const n = chatAsks.get(id); if (n) brain.cancel(n); });
ipcMain.on('chat:send', async (_e, chatId: string, text: string) => {
  const thread = chats.get(chatId);
  const q = String(text ?? '').trim().slice(0, 4000);
  if (!thread || !q) return;
  const to = (kind: 'chunk' | 'done' | 'error', t: string) => pageWindow('settings')?.webContents.send('chat:event', { chat: chatId, kind, text: t });
  const history = thread.messages.slice(-14).map((m) => ({ role: m.role, text: m.text }));
  chats.append(chatId, { role: 'user', text: q, at: Date.now() });
  if (brain.status.state !== 'ready') return to('error', say3('Mon cerveau n’est pas prêt : réessaie dans un instant.', 'My brain is not ready: try again in a moment.', 'Bộ não của tớ chưa sẵn sàng: thử lại sau nhé.'));
  const id = ++chatAskId;
  chatAsks.set(chatId, id);
  await answer(id, q, (ev) => {
    if (ev.kind === 'done') chats.append(chatId, { role: 'gilbert', text: ev.text, at: Date.now() });
    to(ev.kind, ev.text);
  }, { history, long: true });
  chatAsks.delete(chatId);
});

// ---------- mises à jour ----------

let offeredVersion = '';
let updating = false;

/** Télécharge, vérifie et installe la version proposée, puis passe la main à la nouvelle */
async function applyUpdate(u: Update) {
  updating = true;
  try {
    const zip = await download(u, (pct) => send({ type: 'offer', id: 'update-download', text: say3(`Je télécharge ma nouvelle version : ${pct} %`, `Downloading my new version: ${pct}%`, `Tớ đang tải bản mới: ${pct} %`), actions: [], ttl: 8000 }));
    send({ type: 'offer', id: 'update-install', text: say3('Je m’installe… je reviens tout de suite.', 'Installing myself… back in a moment.', 'Tớ đang cài… quay lại ngay.'), actions: [], ttl: 20_000 });
    install(u, zip);
    saveSettings(settings, true);
    journal.flush();
    app.exit(0);
  } catch (e) {
    updating = false;
    assistant.tell(say3('Ma mise à jour a échoué, je reste comme je suis. Je réessaierai plus tard.', 'My update failed, so I stay as I am. I’ll try again later.', 'Cập nhật không thành công, tớ giữ nguyên. Lát nữa tớ thử lại.'));
    console.error('update:', e instanceof Error ? e.message : e);
  }
}

/** Une nouvelle version publiée sur GitHub ? On le propose (une fois par lancement et par version) */
async function lookForUpdate() {
  if (!settings.updates || updating || !desktopSupported()) return;
  const u = await checkForUpdate().catch(() => null);
  if (!u || offeredVersion === u.version) return;
  offeredVersion = u.version;
  assistant.tell(
    say3(`Une nouvelle version de moi est prête (${u.version}). Je me mets à jour ?`, `A new version of me is ready (${u.version}). Update now?`, `Có bản mới của tớ (${u.version}). Cập nhật nhé?`),
    [{ label: say3('Mettre à jour', 'Update', 'Cập nhật'), value: 'yes' }, { label: say3('Plus tard', 'Later', 'Để sau'), value: 'no' }],
    (v) => { if (v === 'yes') void applyUpdate(u); },
    true,
  );
}

// ---------- démarrage ----------

// Linux : fenêtre transparente (il faut un compositeur) ; dans un AppImage le bac à sable SUID de Chromium n'est pas
// utilisable (et certaines distributions interdisent le mode non privilégié) : on le coupe là, les fenêtres gardent
// leur isolation (contextIsolation, sandbox) et ne chargent que des fichiers locaux
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
  if (process.env.APPIMAGE) app.commandLine.appendSwitch('no-sandbox');
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    settings = loadSettings();
    // ouverte depuis l'installeur : elle se copie sur le bureau et s'y relance, sans rien démarrer ici
    if (moveToDesktop()) {
      app.exit(0);
      return;
    }
    // (seulement l'appli installée : en développement, rien à ranger, et le dossier de réglages est le même)
    const firstRun = app.isPackaged && (!settings.installed || process.argv.includes(FRESH));
    if (firstRun) {
      installing = finishInstall().then(({ done }) => {
        // ce qui a raté (raccourci du bureau) sera refait au prochain lancement
        if (!done) return;
        settings.installed = true;
        justInstalled = true;
        saveSettings(settings);
      }).catch(() => {});
    }
    if (app.isPackaged) {
      installing.then(() => setHomeIcon());
    }
    if (settings.quietUntil && !isQuiet()) settings.quietUntil = 0;
    app.dock?.hide();
    memory = new MemoryStore();
    projects = new ProjectStore();
    projects.on('change', () => pageWindow('settings')?.webContents.send('projects:change'));
    // une info neuve : le rapport est réécrit un peu après (une seule fois pour plusieurs infos d'affilée)
    projects.on('fresh', (id: string) => scheduleReport(id));
    mood = new Mood();
    journal = new Journal();
    // les objets retirés de la boutique : on les range et on rend leur prix
    const gone = settings.owned.filter((id) => id in RETIRED);
    if (gone.length) {
      for (const id of gone) journal.refund(RETIRED[id]);
      update({ owned: settings.owned.filter((id) => !(id in RETIRED)), skin: { fur: settings.skin.fur in RETIRED ? 'gray' : settings.skin.fur, accessory: settings.skin.accessory in RETIRED ? '' : settings.skin.accessory } });
    }
    chats = new ChatStore();
    journal.on('rain', (acorns: number) => send({ type: 'rain', acorns }));
    journal.on('change', (d) => {
      pageWindow('settings')?.webContents.send('journal:change', d);
      // les glands gagnés ou dépensés : la boutique suit
      refreshPrefs();
    });
    brain = new Brain({ lang: settings.lang, humor: settings.humor }, memory.data, settings.brainModel);
    memory.on('change', (m: Memory) => {
      brain.setMemory(m);
      send({ type: 'memory', memory: m });
      pageWindow('settings')?.webContents.send('carnet:change', m);
    });
    assistant = new Assistant({
      brain,
      memory,
      send,
      lang: () => settings.lang,
      quiet: () => isQuiet() || meeting,
      userIdle: () => powerMonitor.getSystemIdleTime(),
      focusing: () => Boolean(focus?.active),
      onImportantMail: () => { if (settings.journal) journal.count('mails'); },
      onMailTriaged: (m, summary, important, needsReply, deadline) => {
        const matched = projects.noteFromMail(m, summary, important, needsReply, deadline);
        if (!matched && (important || needsReply) && settings.projectIdeas) void suggestProject(m, summary);
      },
      projectTick: () => {
        const out: { text: string; fact: string; urgent: boolean }[] = [...projects.reminders(settings.lang)];
        const digest = projects.digest(projectSources());
        if (digest) out.push({ text: digest, fact: digest, urgent: false });
        return out;
      },
      projectBrief: (title) => projects.brief(title, settings.lang),
      projectsToday: () => {
        const day = new Date().toLocaleDateString('sv'), soon = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString('sv');
        const out: { id: string; name: string; text: string; due: string; late: boolean }[] = [];
        for (const v of projects.views(projectSources())) {
          const p = v.project;
          if (p.status === 'done') continue;
          for (const td of p.todos) if (!td.done && td.due && td.due <= soon) out.push({ id: p.id, name: p.name, text: td.text, due: td.due, late: td.due < day });
          for (const a of v.advice.filter((x) => x.kind === 'reply')) out.push({ id: p.id, name: p.name, text: a.text, due: '', late: false });
        }
        return out.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')).slice(0, 6);
      },
      focusToday: () => journal.day().focus,
      moodLine: () => (settings.moods ? mood.line(settings.lang) : ''),
      used: markTried,
      onStatus: (st) => { pageWindow('settings')?.webContents.send('connections:status', st); refreshPrefs(); },
    });
    assistant.tasks.on('done', (t: Task) => {
      if (settings.journal) journal.taskDone(t.title);
      // la dernière étape d'une tâche découpée : la tâche est faite
      const parent = t.parent && assistant.tasks.tasks.find((x) => x.id === t.parent && !x.done);
      if (parent && assistant.tasks.steps(parent.id).every((x) => x.done)) {
        assistant.tasks.done(parent.id);
        assistant.tell(say3(`Toutes les étapes sont faites : je coche « ${parent.title} » !`, `All steps done: ticking off "${parent.title}"!`, `Xong hết các bước: tớ đánh dấu « ${parent.title} »!`));
      }
    });
    assistant.tasks.on('change', refreshPrefs);
    assistant.calendar.on('events', refreshPrefs);
    // un autre cerveau se télécharge en arrière-plan : la barre avance, sans reconstruire le menu
    let pullTimer: NodeJS.Timeout | null = null;
    brain.on('pull', () => { pullTimer ??= setTimeout(() => { pullTimer = null; refreshPrefs(); }, 800); });
    brain.on('status', (status: BrainStatus) => {
      send({ type: 'brain', status });
      if (status.state !== 'downloading') refreshPrefs();
      // pendant un téléchargement, on ne reconstruit pas le menu à chaque pourcent
      if (status.state !== 'downloading') refreshTray();
      else trayTimer ??= setTimeout(() => { trayTimer = null; refreshTray(); }, 3000);
    });
    focus = new Focus({
      journal,
      send,
      lang: () => settings.lang,
      tell: (text, actions, onAnswer) => assistant.tell(text, actions, onAnswer),
      onChange: () => {
        refreshTray();
        refreshPrefs();
        if (focus.active) return markTried('focus');
        assistant.wake();
        if (settings.moods) mood.played('focus');
      },
    });
    watcher = new ScreenWatcher({
      brain,
      own: () => win,
      lang: () => settings.lang,
      humor: () => settings.humor,
      userIdle: () => powerMonitor.getSystemIdleTime(),
      // en session de travail, il ne regarde rien : il bosse
      quiet: () => isQuiet() || Boolean(focus?.active),
      say: (text, evenIdle) => assistant.tell(text, undefined, undefined, evenIdle),
      pressure: () => assistant.pressure(),
      profile: () => memory.data.profile,
      onScreen: (w) => { void lookAtScreen(w); },
      onMeeting: (on) => {
        meeting = on;
        send({ type: 'meeting', on });
        refreshTray();
        if (!on) assistant.wake();
      },
    });
    // le micro (notes vocales) n'est accordé qu'à Gilbert lui-même
    session.defaultSession.setPermissionRequestHandler((wc, permission, ok) => ok(permission === 'media' && wc === win?.webContents));
    session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media' && wc === win?.webContents);
    createWindow();
    createTray();
    // une nouvelle version ? (un peu après le démarrage, puis toutes les 6 h)
    setTimeout(() => void lookForUpdate(), 45_000);
    setInterval(() => void lookForUpdate(), 6 * 3600_000);
    // sa fenêtre s'ouvre : il saute s'asseoir sur son bord du haut (le panneau est à 6 px du bord
    // de la fenêtre, et sa bordure pixel déborde de 3 px)
    // on déplace ou on redimensionne sa fenêtre : il redescend (une seule fois) et ne remonte qu'une fois qu'on l'a lâchée
    let settled: NodeJS.Timeout | null = null;
    let moving = false;
    onPageWindow('settings', (b, follow) => {
      // tant que sa fenêtre est ouverte, Gilbert (et ses bulles) passent au-dessus d'elle
      if (!follow) win?.setAlwaysOnTop(true, b ? 'pop-up-menu' : 'floating');
      settingsBounds = b;
      if (!b) settingsTab = 'home';
      if (settled) { clearTimeout(settled); settled = null; }
      if (follow && b) {
        if (!moving) { moving = true; send({ type: 'perch', at: null }); }
        settled = setTimeout(() => { settled = null; moving = false; perchOnSettings(); }, 450);
        return;
      }
      moving = false;
      perchOnSettings();
    });
    brain.start();
    assistant.mail.primaryOnly = settings.mailPrimaryOnly;
    // Le mot de passe du mail est dans le trousseau : une appli neuve peut déclencher la demande du mot
    // de passe de la session, qui fige tout le temps qu'elle est ouverte. Au tout premier lancement, on
    // laisse donc l'installation finir et Gilbert dire bonjour avant d'aller le lire.
    if (firstRun) installing.then(() => setTimeout(() => assistant.start(), 20_000));
    else assistant.start();
    startJournal();
    startDistractionWatch();
    clip = new ClipboardHelper({
      brain,
      send,
      lang: () => settings.lang,
      allowed: () => settings.clipboard && !isQuiet() && !meeting && !focus.active && powerMonitor.getSystemIdleTime() < 30,
      used: () => markTried('clipboard'),
    });
    clip.start();
    badges = new MessageBadges((app, n) => assistant.announce(say3(
      `Nouveau message sur ${app}${n > 1 ? ` (${n} non lus)` : ''}.`,
      `New message on ${app}${n > 1 ? ` (${n} unread)` : ''}.`,
      `Có tin nhắn mới trên ${app}${n > 1 ? ` (${n} chưa đọc)` : ''}.`)));
    badges.setEnabled(settings.messages);
    tidy = new Tidy();
    // l'humeur au lancement (pour sa façon de dire bonjour), et la fête de votre rencontre
    if (settings.moods) {
      setTimeout(() => send({ type: 'mood', value: mood.value }), 500);
      const years = friendship(journal.data.firstSeen);
      if (years && assistant.brief.once(`friendship-${new Date().getFullYear()}`)) {
        setTimeout(() => assistant.tell(say3(
          `Ça fait ${years} an${years > 1 ? 's' : ''} jour pour jour qu'on se connaît ! Merci de me supporter. Enfin, de me garder sur ton bureau.`,
          `${years} year${years > 1 ? 's' : ''} to the day since we met! Thanks for putting up with me. Well, for keeping me on your desktop.`,
          `Hôm nay tròn ${years} năm mình quen nhau! Cảm ơn cậu đã chịu đựng tớ. À, đã giữ tớ trên màn hình.`)), 90_000);
      }
    }
    setTimeout(checkDownloads, 15 * 60_000);
    setInterval(checkDownloads, 6 * 3600_000);
    watcher.setEnabled(settings.vision);
    music.on('change', (t: Track) => {
      assistant.setNowPlaying(t.playing ? describe(t, settings.lang) : '');
      refreshTray();
    });
    music.on('track', (t: Track, byCommand: boolean) => { if (!byCommand) commentTrack(t).catch(() => {}); });
    music.start();
    // la première fois : après le brief (et une fois le cerveau prêt), il propose le guide
    const offer = setInterval(() => {
      if (settings.guided) return clearInterval(offer);
      if (!assistant.briefPending && brain.status.state === 'ready') { clearInterval(offer); setTimeout(offerGuide, 15_000); }
    }, 5000);

    for (const ev of ['display-metrics-changed', 'display-added', 'display-removed'] as const) {
      screen.on(ev as 'display-added', fitToScreen);
    }

    // inactivité de l'utilisateur : Gilbert s'endort quand tu t'absentes
    let wasAway = false;
    setInterval(() => {
      const seconds = powerMonitor.getSystemIdleTime();
      send({ type: 'idle', seconds });
      // tu reviens : les messages en attente peuvent être dits
      if (wasAway && seconds < 3) assistant.wake();
      wasAway = seconds >= 60;
    }, 3000);
    for (const ev of ['resume', 'unlock-screen'] as const) {
      powerMonitor.on(ev as 'resume', () => send({ type: 'idle', seconds: 0 }));
    }

    // fin du mode Chut
    setInterval(() => {
      if (settings.quietUntil && !isQuiet()) setQuiet(0);
    }, 30_000);
  });

  app.on('window-all-closed', () => app.quit());

  // quitter : d'abord il saute dans sa poubelle (au plus 3,5 s), puis on libère le modèle
  // (sinon llama.cpp plante en sortant)
  let leaving = false, disposed = false;
  // il est rentré : l'icône du bureau retrouve son couvercle avant de s'arrêter
  ipcMain.on('app:quit', () => { leaving = true; app.quit(); });
  app.on('before-quit', (e) => {
    if (!leaving && win && !win.isDestroyed()) {
      e.preventDefault();
      leaving = true;
      // il rentre dans son icône du bureau si elle est là (elle a pu bouger), sinon dans sa poubelle
      desktopHome().catch(() => null).then((home) => send({ type: 'bye', home }));
      setTimeout(() => app.quit(), 7000);
      return;
    }
    if (disposed || !brain) return;
    e.preventDefault();
    disposed = true;
    assistant?.stop();
    music.stop();
    focus?.dispose();
    clip?.stop();
    journal?.flush();
    brain.dispose().finally(() => app.quit());
  });
}
