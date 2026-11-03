// La fenêtre de Gilbert : réglages, carnet et connexions (mail, agenda), en onglets.
// Sans cadre système : un panneau pixel posé au centre de l'écran, fixe, au premier plan,
// avec sa propre croix pour fermer.

import { app, BrowserWindow, screen, shell } from 'electron';
import path from 'node:path';
import type { SettingsTab } from '../shared/types';

const windows = new Map<string, BrowserWindow>();
/** Prévenu quand une fenêtre s'affiche (avec sa place à l'écran) ou se ferme (null) */
const watchers = new Map<string, (bounds: Electron.Rectangle | null, follow?: boolean) => void>();

/** `follow` : la fenêtre bouge ou change de taille (Gilbert la suit sans sauter) ; sinon elle s'ouvre ou se ferme */
export const onPageWindow = (key: string, cb: (bounds: Electron.Rectangle | null, follow?: boolean) => void) => watchers.set(key, cb);

export const pageWindow = (key: string) => {
  const w = windows.get(key);
  return w && !w.isDestroyed() ? w : null;
};

function openPage(key: string, title: string, size: { width: number; height: number }, hash = '') {
  const open = pageWindow(key);
  if (open) {
    if (hash) open.webContents.send('prefs:tab', hash);
    open.show();
    app.focus({ steal: true });
    open.focus();
    watchers.get(key)?.(open.getBounds());
    return;
  }
  const area = screen.getPrimaryDisplay().workArea;
  // centrée, avec au moins 150 px au-dessus pour Gilbert, assis sur son bord du haut
  const width = Math.min(size.width, area.width - 40), height = Math.min(size.height, area.height - 300);
  const win = new BrowserWindow({
    width,
    height,
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    title,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    // redimensionnable (sur Mac ; sous Windows une fenêtre transparente ne l'est pas) : la page se réarrange
    resizable: true,
    minWidth: Math.min(620, width),
    minHeight: Math.min(520, height),
    maxWidth: area.width - 40,
    maxHeight: area.height - 160,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, `${key}-preload.js`),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  win.setAlwaysOnTop(true, 'floating');
  // les liens (aide Google…) s'ouvrent dans le navigateur, pas dans la fenêtre
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadFile(path.join(__dirname, key, 'index.html'), { hash });
  win.once('ready-to-show', () => {
    win.show();
    app.focus({ steal: true });
  });
  win.once('show', () => { const b = win.getBounds(); lastSig = `${b.x},${b.y},${b.width},${b.height}`; watchers.get(key)?.(b); });
  // on la déplace ou on la redimensionne : Gilbert la suit en direct, sans sauter (au plus toutes les 40 ms)
  let last = 0;
  let lastSig = '';
  let trailing: NodeJS.Timeout | null = null;
  const follow = () => {
    if (win.isDestroyed()) return;
    const wait = 40 - (Date.now() - last);
    if (trailing) clearTimeout(trailing);
    const go = () => {
      trailing = null;
      last = Date.now();
      if (win.isDestroyed()) return;
      // seulement si la fenêtre a vraiment changé de place ou de taille (sinon un événement sans changement relancerait tout)
      const b = win.getBounds(), sig = `${b.x},${b.y},${b.width},${b.height}`;
      if (sig === lastSig) return;
      lastSig = sig;
      watchers.get(key)?.(b, true);
    };
    if (wait <= 0) go(); else trailing = setTimeout(go, wait);
  };
  win.on('move', follow);
  win.on('moved', follow);
  win.on('resize', follow);
  win.on('closed', () => {
    windows.delete(key);
    watchers.get(key)?.(null);
  });
  windows.set(key, win);
}

export const openSettings = (tab: SettingsTab = 'general') => openPage('settings', 'Gilbert', { width: 700, height: 780 }, tab);
