// Accès au process principal. Hors d'Electron (aperçu navigateur), on fournit
// une version factice : `window.__gilbert(cmd)` simule les commandes, et un faux cerveau
// répond en recrachant la question mot par mot.

import { DEFAULT_SETTINGS, EMPTY_MEMORY, type BrainEvent, type BrainStatus, type Command, type GilbertApi } from '../shared/types';

declare global {
  interface Window {
    gilbert?: GilbertApi;
    __gilbert?: (cmd: Command) => void;
  }
}

export const isPreview = !window.gilbert;

function previewApi(): GilbertApi {
  let listener: ((cmd: Command) => void) | null = null;
  let brainListener: ((e: BrainEvent) => void) | null = null;
  const status: BrainStatus = { state: 'ready', model: 'faux cerveau (aperçu)' };
  window.__gilbert = (cmd) => listener?.(cmd);
  return {
    getSettings: async () => ({ ...DEFAULT_SETTINGS }),
    briefPending: async () => false,
    replayBrief: () => {},
    music: async () => ({ player: '', playing: false, title: '', artist: '' }),
    focus: () => {},
    played: () => {},
    micPermission: async () => true,
    transcribe: async () => '',
    quit: () => {},
    introDone: () => {},
    home: async () => null,
    tried: () => {},
    setIgnoreMouse: () => {},
    setFocus: () => {},
    showMenu: () => {},
    savePosition: () => {},
    onCommand: (cb) => { listener = cb; },
    brainStatus: async () => status,
    brainDownload: () => {},
    brainAsk: (id, text) => {
      const words = `Tu m'as dit « ${text} ». Je suis un faux cerveau, mais je t'écoute.`.split(/(?= )/);
      words.forEach((w, i) => setTimeout(() => brainListener?.({ id, kind: 'chunk', text: w }), 600 + i * 80));
      setTimeout(() => brainListener?.({ id, kind: 'done', text: words.join('') }), 700 + words.length * 80);
    },
    brainCancel: () => {},
    onBrain: (cb) => { brainListener = cb; },
    memoryGet: async () => structuredClone(EMPTY_MEMORY),
    openSettings: () => {},
    notifyAnswer: () => {},
  };
}

export const api: GilbertApi = window.gilbert ?? previewApi();
