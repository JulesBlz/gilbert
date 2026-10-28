// Pont de la fenêtre des réglages : réglages, carnet et connexions (ses trois onglets).
import { contextBridge, ipcRenderer } from 'electron';
import type { CarnetApi, ConnectionsApi, ConnStatus, JournalData, Memory, PrefsApi, PrefsState, SettingsTab } from '../shared/types';

const prefs: PrefsApi = {
  get: () => ipcRenderer.invoke('prefs:get'),
  set: (patch) => ipcRenderer.send('prefs:set', patch),
  action: (a, arg) => ipcRenderer.send('prefs:action', a, arg),
  onChange: (cb) => { ipcRenderer.on('prefs:change', (_e, s: PrefsState) => cb(s)); },
  onTab: (cb) => { ipcRenderer.on('prefs:tab', (_e, t: SettingsTab) => cb(t)); },
  journal: () => ipcRenderer.invoke('journal:get'),
  onJournal: (cb) => { ipcRenderer.on('journal:change', (_e, d: JournalData) => cb(d)); },
};

const carnet: CarnetApi = {
  get: () => ipcRenderer.invoke('carnet:get'),
  save: (memory) => ipcRenderer.send('carnet:save', memory),
  forgetAll: () => ipcRenderer.send('carnet:forget'),
  onChange: (cb) => { ipcRenderer.on('carnet:change', (_e, m: Memory) => cb(m)); },
};

const connections: ConnectionsApi = {
  get: () => ipcRenderer.invoke('connections:get'),
  saveMail: (m) => ipcRenderer.invoke('connections:saveMail', m),
  disconnectMail: () => ipcRenderer.send('connections:disconnectMail'),
  saveCalendar: (url, auth) => ipcRenderer.invoke('connections:saveCalendar', url, auth),
  disconnectCalendar: () => ipcRenderer.send('connections:disconnectCalendar'),
  openExternal: (url) => ipcRenderer.send('connections:open', url),
  onStatus: (cb) => { ipcRenderer.on('connections:status', (_e, s: { mail: ConnStatus; calendar: ConnStatus }) => cb(s)); },
};

contextBridge.exposeInMainWorld('prefs', prefs);
contextBridge.exposeInMainWorld('carnet', carnet);
contextBridge.exposeInMainWorld('connections', connections);
