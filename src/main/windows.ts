// La fenêtre de Gilbert : réglages, carnet et connexions (mail, agenda), en onglets.
// Sans cadre système : un panneau pixel posé au centre de l'écran, fixe, au premier plan,
// avec sa propre croix pour fermer.

import { app, BrowserWindow, screen, shell } from 'electron';
import path from 'node:path';
import type { SettingsTab } from '../shared/types';

const windows = new Map<string, BrowserWindow>();
/** Prévenu quand une fenêtre s'affiche (avec sa place à l'écran) ou se ferme (null) */
const watchers = new Map<string, (bounds: Electron.Rectangle | null) => void>();

export const onPageWindow = (key: string, cb: (bounds: Electron.Rectangle | null) => void) => watchers.set(key, cb);

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
  const width = Math.min(size.width, area.width - 40), height = Math.min(size.height, area.height - 60);
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
    resizable: false,
    movable: false,
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
  win.once('show', () => watchers.get(key)?.(win.getBounds()));
  win.on('closed', () => {
    windows.delete(key);
    watchers.get(key)?.(null);
  });
  windows.set(key, win);
}

export const openSettings = (tab: SettingsTab = 'general') => openPage('settings', 'Gilbert', { width: 580, height: 780 }, tab);
