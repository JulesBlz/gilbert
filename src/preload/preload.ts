import { contextBridge, ipcRenderer } from 'electron';
import type { BrainEvent, Command, GilbertApi } from '../shared/types';

const api: GilbertApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  briefPending: () => ipcRenderer.invoke('brief:pending'),
  replayBrief: () => ipcRenderer.send('brief:replay'),
  music: (cmd: string) => ipcRenderer.invoke('music', cmd),
  focus: (minutes: number | 'stop') => ipcRenderer.send('focus', minutes),
  played: (kind: string) => ipcRenderer.send('played', kind),
  micPermission: () => ipcRenderer.invoke('voice:permission'),
  transcribe: (pcm: Float32Array) => ipcRenderer.invoke('voice:transcribe', pcm),
  quit: () => ipcRenderer.send('app:quit'),
  introDone: (answers) => ipcRenderer.send('intro:done', answers),
  home: () => ipcRenderer.invoke('home:get'),
  pendingAcorns: () => ipcRenderer.invoke('acorns:pending'),
  collectAcorns: (acorns) => ipcRenderer.send('acorns:collect', acorns),
  tried: (key) => ipcRenderer.send('tried', key),
  setIgnoreMouse: (ignore) => ipcRenderer.send('mouse:ignore', ignore),
  setFocus: (on) => ipcRenderer.send('window:focus', on),
  showMenu: () => ipcRenderer.send('menu:show'),
  savePosition: (x) => ipcRenderer.send('settings:position', x),
  onCommand: (cb) => {
    ipcRenderer.on('command', (_e, cmd: Command) => cb(cmd));
  },
  brainStatus: () => ipcRenderer.invoke('brain:status'),
  brainModels: () => ipcRenderer.invoke('brain:models'),
  brainUse: (id) => ipcRenderer.send('brain:use', id),
  brainDownload: () => ipcRenderer.send('brain:download'),
  brainAsk: (id, text) => ipcRenderer.send('brain:ask', id, text),
  brainCancel: (id) => ipcRenderer.send('brain:cancel', id),
  onBrain: (cb) => {
    ipcRenderer.on('brain:event', (_e, ev: BrainEvent) => cb(ev));
  },
  memoryGet: () => ipcRenderer.invoke('memory:get'),
  openSettings: (tab?: string) => ipcRenderer.send('settings:open', tab),
  notifyAnswer: (id, value) => ipcRenderer.send('notify:answer', id, value),
};

contextBridge.exposeInMainWorld('gilbert', api);
