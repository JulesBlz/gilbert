// Types partagés entre le process principal, le preload et l'interface.

import type { Skin } from './skins';

export type Size = 'S' | 'M' | 'L';

/**
 * Son icône de poubelle sur le bureau : son centre (px de la fenêtre de Gilbert) et sa taille (px).
 * `visible` : rien ne la cache en ce moment (sinon la poubelle de Gilbert ne se montre pas, et ne sert pas).
 */
export interface Home { x: number; y: number; size: number; visible: boolean }
export type Lang = 'fr' | 'en' | 'vi';

/** Format des dates et heures selon la langue */
export const LOCALE: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB', vi: 'vi-VN' };
/**
 * Les consignes au modèle sont en français ou en anglais (en anglais pour le vietnamien, qu'il
 * comprend mieux ainsi) ; la langue dans laquelle il doit répondre est précisée à part.
 */
export const SPEAK: Record<Lang, string> = {
  fr: 'en français, en le tutoyant',
  en: 'in English',
  vi: 'in Vietnamese, casually: call yourself « tớ » and your human « cậu »',
};
export type Humor = 'sober' | 'normal' | 'unbearable';

/** Taille d'un pixel de Gilbert à l'écran, en px CSS */
export const PIXEL: Record<Size, number> = { S: 2, M: 4, L: 6 };

export interface Settings {
  size: Size;
  muted: boolean;
  /** Mode Chut : horodatage (ms) jusqu'auquel Gilbert se tait, 0 sinon */
  quietUntil: number;
  /** Dernière position horizontale de Gilbert (px depuis la gauche), null au premier lancement */
  x: number | null;
  /** Secondes sans interaction avant que Gilbert aille se cacher en haut de l'écran (0 = jamais) */
  hideAfterSec: number;
  lang: Lang;
  humor: Humor;
  /** Il regarde l'écran de temps en temps (erreurs, vannes, visios) */
  vision: boolean;
  /** Il a déjà proposé de montrer le guide (première fois) */
  guided: boolean;
  /** Ce que tu as déjà essayé dans le guide (pour le cocher) */
  tried: string[];
  /** Les 10 glands de chaque essai du guide déjà ramassés */
  collected: string[];
  /** Le cerveau choisi (id d'un modèle de brain/models.ts) ; vide : celui qui convient à la mémoire de la machine */
  brainModel: string;
  /** Le premier lancement de l'appli installée est fait (installeur rangé, poubelle sur le bureau) */
  installed: boolean;
  /** Ce qu'il porte (pelage, accessoire) et ce qu'on lui a offert à la boutique */
  skin: Skin;
  owned: string[];
  /** Il commente de temps en temps ce que tu écoutes */
  musicComments: boolean;
  /** Il peut chercher sur internet (DuckDuckGo) pour répondre : la seule fonction qui sort de l'ordinateur */
  webSearch: boolean;
  /** Chercher les nouvelles versions sur GitHub (et proposer de s'y mettre) */
  updates: boolean;
  /** Apparence : clair (par défaut), sombre, ou comme le système */
  theme: 'auto' | 'light' | 'dark';
  /** Proposer de créer une fiche projet quand un même sujet revient dans les mails */
  projectIdeas: boolean;
  /** Noter dans les fiches projet ce qu'il voit à l'écran (une ligne, jamais l'écran) */
  projectScreen: boolean;
  /** Il tient le carnet de bord (applis utilisées, sessions, note du soir, résumé de la semaine) */
  journal: boolean;
  /** Il propose son aide sur ce que tu copies (traduire, résumer, corriger, expliquer) */
  clipboard: boolean;
  /** Il a des humeurs : content quand on joue avec lui, boudeur quand on l'oublie */
  moods: boolean;
  /** Il propose de ranger les Téléchargements quand ils débordent */
  tidy: boolean;
  /** La durée choisie au curseur pour les sessions de travail (min) */
  focusMinutes: number;
  /** Mails : seulement la boîte principale (pas les pubs, réseaux sociaux, notifications) */
  mailPrimaryOnly: boolean;
  /** Il prévient quand un message arrive dans WhatsApp, Messages, Signal ou Telegram (Mac) */
  messages: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  size: 'M',
  muted: false,
  quietUntil: 0,
  x: null,
  hideAfterSec: 25,
  lang: 'fr',
  humor: 'normal',
  vision: false,
  guided: false,
  tried: [],
  collected: [],
  installed: false,
  skin: { fur: 'gray', accessory: '' },
  owned: ['gray'],
  musicComments: true,
  webSearch: true,
  updates: true,
  theme: 'light',
  projectIdeas: true,
  projectScreen: true,
  journal: true,
  clipboard: true,
  moods: true,
  tidy: true,
  focusMinutes: 25,
  mailPrimaryOnly: true,
  messages: true,
  brainModel: '',
};

// ---------- carnet de bord ----------

export interface JournalDay {
  /** Minutes passées dans chaque appli (quand tu étais devant l'écran) */
  apps: Record<string, number>;
  focus: { sessions: number; minutes: number; stopped: number };
  /** Rappels et échéances cochés « Fait » */
  done: string[];
  mails: number;
  chats: number;
  /** Note de 3 lignes écrite par Gilbert le soir */
  note: string;
  /** Glands gagnés ce jour-là */
  acorns?: number;
}

export interface JournalData {
  days: Record<string, JournalDay>;
  /** Résumé de la semaine, par lundi (AAAA-MM-JJ) */
  weeks: Record<string, string>;
  /** Glands gagnés en travaillant (un par minute) */
  acorns: { total: number; spent?: { acorns: number }; pending?: { acorns: number } };
  /** Premier lancement de Gilbert (pour l'anniversaire de votre rencontre) */
  firstSeen: number;
}

// ---------- mémoire : ce que Gilbert sait de son humain ----------

/** Ce que Gilbert sait de toi : les questions classiques, puis de quoi mieux te connaître */
export interface Profile {
  name: string;
  /** Comment il t'appelle (sinon ton prénom) */
  nickname: string;
  city: string;
  job: string;
  schedule: string;
  /** Ton anniversaire, « JJ/MM » */
  birthday: string;
  /** Ton carburant : café, thé, chocolat… */
  fuel: string;
  /** L'objectif du moment */
  goal: string;
  /** Ce qui te fait rire */
  humor: string;
  /** Ta pire façon de procrastiner (il saura te reconnaître) */
  procrastination: string;
  /** La phrase qui te remotive (il la ressort quand ça ne va pas) */
  motivation: string;
  /** Sujets sur lesquels ne jamais te chambrer */
  avoid: string;
}

export interface Person {
  id: string;
  name: string;
  relation: string;
  /** Anniversaire au format « JJ/MM », ou vide */
  birthday: string;
}

export interface Fact {
  id: string;
  text: string;
  source: 'onboarding' | 'conversation' | 'carnet';
  createdAt: number;
}

export interface Memory {
  profile: Profile;
  people: Person[];
  facts: Fact[];
  /** Sites ou applis qui te distraient : pendant une session de travail, il te le dit au bout de 10 minutes dessus */
  distractions: string[];
  /** Ancien indicateur des questions de départ (retirées) ; gardé pour relire les anciens fichiers */
  onboarded: boolean;
}

export const EMPTY_MEMORY: Memory = {
  profile: { name: '', nickname: '', city: '', job: '', schedule: '', birthday: '', fuel: '', goal: '', humor: '', procrastination: '', motivation: '', avoid: '' },
  people: [],
  facts: [],
  distractions: [],
  onboarded: false,
};

// ---------- mails, agenda, échéances ----------

/** Compte mail surveillé (le mot de passe d'application est rangé à part, chiffré) */
export interface MailSettings {
  address: string;
  host: string;
  port: number;
  user: string;
}

/** État d'une connexion (mail ou agenda) */
export type ConnStatus =
  | { state: 'off' }
  | { state: 'connecting' }
  | { state: 'on'; detail: string }
  | { state: 'error'; message: string };

export interface CalendarEvent {
  id: string;
  title: string;
  /** Horodatages (ms) */
  start: number;
  end: number;
  allDay: boolean;
  location: string;
}

/** Une échéance : venue d'un mail, de l'agenda, ou ajoutée dans le carnet */
export interface Task {
  id: string;
  title: string;
  /** Jour au format AAAA-MM-JJ, ou vide pour une tâche sans date */
  due: string;
  /** Heure HH:MM, ou vide si c'est pour la journée */
  time: string;
  /** « chat » : un rappel demandé dans la discussion (rappelé à l'heure dite) ; « list » : ajoutée à ta liste */
  source: 'mail' | 'carnet' | 'chat' | 'list';
  done: boolean;
  /** Quand elle a été marquée faite (pour le bilan du soir) */
  doneAt?: number;
  /** Une étape d'une tâche découpée : l'id de la tâche */
  parent?: string;
  /** Rappels déjà faits (« j-3 », « j-1 », « jour », « h-2 ») */
  reminded: string[];
  createdAt: number;
}

/** État du cerveau (modèle de langage local) */
export type BrainStatus =
  | { state: 'missing'; model: string; size: number }
  | { state: 'downloading'; model: string; size: number; progress: number }
  | { state: 'loading'; model: string }
  | { state: 'ready'; model: string }
  | { state: 'error'; model: string; message: string };

/** Un cerveau qu'on peut choisir (léger, équilibré, puissant) */
export interface BrainChoice {
  id: string;
  tier: 'light' | 'balanced' | 'powerful';
  label: string;
  /** Taille du téléchargement, en octets */
  size: number;
  /** RAM conseillée, en Go */
  minRamGB: number;
  downloaded: boolean;
  /** Celui qui tourne en ce moment (ou celui qu'on télécharge pour la première fois) */
  active: boolean;
  /** Celui qui convient le mieux à la mémoire de cette machine */
  recommended: boolean;
  /** Avancement (0 à 1) de son téléchargement en arrière-plan, sinon null */
  pulling: number | null;
}

/** Morceaux de réponse du cerveau, rattachés à une question par `id` */
export interface BrainEvent {
  id: number;
  kind: 'chunk' | 'done' | 'error';
  text: string;
}

/** Tenue météo de Gilbert, le temps d'une bulle qui parle du temps */

/** Messages envoyés par le process principal à l'interface */
export type Command =
  | { type: 'settings'; settings: Settings }
  | { type: 'idle'; seconds: number }
  /** Ouvrir la discussion (menu « Lui parler », guide), avec éventuellement un exemple tout prêt */
  /** `fill` : le texte est déjà écrit dans le champ (il n'y a plus qu'à appuyer sur Entrée) */
  | { type: 'chat'; text?: string; fill?: boolean }
  /** Il remonte se cacher en haut de l'écran */
  | { type: 'hide' }
  /** On quitte : il saute dans sa poubelle */
  | { type: 'bye'; home: Home | null }
  /** Des glands viennent d'être gagnés : ils tombent du haut de l'écran */
  | { type: 'rain'; acorns: number }
  /** Sa fenêtre s'ouvre (son bord du haut, en px de l'écran de Gilbert) ou se ferme (null) */
  /** Où il s'assoit : le bord d'une fenêtre (x, largeur), ou un point précis (`spot`, centre de ses pieds) */
  | { type: 'perch'; at: { x: number; y: number; width: number; spot?: number } | null }
  /** On essaie quelque chose depuis la fenêtre : il saute sur le côté, hors de la fenêtre (`x0` à `x1`) */
  | { type: 'aside'; x0: number; x1: number }
  | { type: 'quiet'; on: boolean }
  /** Il prépare un brief, un récap ou un bilan : petits points pendant que le cerveau écrit */
  | { type: 'thinking'; on: boolean }
  /** Session de travail : il bosse avec toi jusqu'à `endsAt` ; à la fin, éventuellement un trésor */
  | { type: 'focus'; on: true; endsAt: number; minutes: number }
  | { type: 'focus'; on: false; done: boolean; minutes: number; acorns: number }
  /** Une tenue pour la bulle qui suit (il parle de la météo) */
  /** Une aide discrète sur ce que tu viens de copier : il ne bouge pas, juste une petite bulle */
  /**
   * Une aide discrète (il ne bouge pas). `thinking` : petits points en attendant le résultat (même id) ;
   * `ttl` : durée avant qu'elle s'en aille (0 : elle reste jusqu'à un bouton ou qu'on attrape Gilbert) ;
   * `long` : un long texte, bulle plus large.
   */
  /** Une barre de progression dans la bulle (téléchargement) : le même texte, la barre qui avance */
  | { type: 'progress'; id: string; label: string; pct: number }
  | { type: 'offer'; id: string; text: string; actions: { label: string; value: string }[]; ttl?: number; thinking?: boolean; long?: boolean }
  /** Humeur du moment (0 = boude, 1 = ravi) */
  | { type: 'mood'; value: number }
  /** Visio ou présentation en cours : il se tait sans rien dire */
  | { type: 'meeting'; on: boolean }
  | { type: 'brain'; status: BrainStatus }
  | { type: 'memory'; memory: Memory }
  | { type: 'learned'; facts: string[] }
  /** Quelque chose à te dire de lui-même (mail important, réunion, échéance) ; boutons éventuels */
  /** `alert` : il sursaute avec son « ! » (un mail, un message qui arrive), même sans urgence */
  | { type: 'notify'; id: string; text: string; urgent: boolean; alert?: boolean; actions?: { label: string; value: string }[] };

/** API exposée par le preload sous `window.gilbert` */
export interface GilbertApi {
  getSettings(): Promise<Settings>;
  /** Le brief du jour va arriver : pas la peine de dire bonjour deux fois */
  briefPending(): Promise<boolean>;
  /** Refaire le brief du jour (demandé dans la discussion) */
  replayBrief(): void;
  /** Session de travail : démarrer (minutes) ou arrêter avant la fin */
  focus(minutes: number | 'stop'): void;
  /** Interaction avec lui (clic, jeu) : nourrit son humeur */
  played(kind: 'click' | 'throw' | 'chat'): void;
  /** Ce que Gilbert vient de dire dans une bulle (pour l'historique) */
  said(text: string): void;
  /** Note vocale : l'autorisation du micro (macOS), puis le son (16 kHz, mono) à transcrire */
  micPermission(): Promise<boolean>;
  transcribe(pcm: Float32Array): Promise<string>;
  /** Il est dans sa poubelle : on quitte pour de bon */
  quit(): void;
  /** Les premières questions pour faire connaissance sont finies ou refusées (`answers` : ce qui a été répondu) */
  introDone(answers: Partial<Profile>): void;
  /** Son icône de poubelle sur le bureau (appli installée, Mac), d'où il sort ; null sinon */
  home(): Promise<Home | null>;
  /** Les glands gagnés qui attendent au sol (pas encore ramassés) */
  pendingAcorns(): Promise<{ acorns: number }>;
  /** Des glands ramassés à la souris : ils rejoignent le solde */
  collectAcorns(acorns: number): void;
  /** Une fonction du guide a servi (vue seulement d'ici : on l'a fait descendre par la queue) */
  tried(key: 'hide'): void;
  /** Lecture / pause / suivant / précédent, ou juste « qu'est-ce qui joue ? » */
  music(cmd: 'status' | 'play' | 'pause' | 'next' | 'previous'): Promise<{ player: string; playing: boolean; title: string; artist: string }>;
  setIgnoreMouse(ignore: boolean): void;
  /** Rend la fenêtre capable de recevoir le clavier (le temps d'une discussion) */
  setFocus(on: boolean): void;
  showMenu(): void;
  savePosition(x: number): void;
  onCommand(cb: (cmd: Command) => void): void;
  brainStatus(): Promise<BrainStatus>;
  /** Les cerveaux qu'on peut choisir */
  brainModels(): Promise<BrainChoice[]>;
  /** Choisit ce cerveau (le télécharge d'abord s'il le faut) */
  brainUse(id: string): void;
  brainDownload(): void;
  brainAsk(id: number, text: string): void;
  brainCancel(id: number): void;
  onBrain(cb: (e: BrainEvent) => void): void;
  memoryGet(): Promise<Memory>;
  /** La fenêtre de Gilbert (Accueil par défaut) */
  openSettings(tab?: SettingsTab): void;
  /** Réponse à une notification à boutons (ex. « ajouter cette échéance ? ») */
  notifyAnswer(id: string, value: string): void;
}

/** API de la fenêtre des connexions, sous `window.connections` */
export interface ConnectionsApi {
  get(): Promise<{
    lang: Lang;
    mail: MailSettings | null;
    hasPassword: boolean;
    calendarUrl: string;
    /** Agenda privé : identifiant enregistré, et s'il y a un mot de passe */
    calendarUser: string;
    hasCalendarPassword: boolean;
    status: { mail: ConnStatus; calendar: ConnStatus };
  }>;
  /** Teste la connexion puis enregistre ; mot de passe vide = garder l'actuel */
  saveMail(m: MailSettings & { password: string }): Promise<{ ok: boolean; message: string }>;
  disconnectMail(): void;
  /** `auth` : identifiant et mot de passe d'un agenda privé (mot de passe vide = garder l'actuel) */
  saveCalendar(url: string, auth?: { user: string; password: string }): Promise<{ ok: boolean; message: string }>;
  disconnectCalendar(): void;
  openExternal(url: string): void;
  onStatus(cb: (s: { mail: ConnStatus; calendar: ConnStatus }) => void): void;
}

/** Ce que la fenêtre des réglages affiche, en plus des réglages eux-mêmes */
export interface PrefsState {
  settings: Settings;
  /** Mode Chut en cours (jusqu'à `settings.quietUntil`) */
  quiet: boolean;
  /** La vision existe sur ce système, et la permission d'écran (Mac) */
  vision: { supported: boolean; permission: 'granted' | 'denied' | 'not-determined' | 'unsupported' };
  brain: BrainStatus;
  brains: BrainChoice[];
  /** La mémoire de cette machine, en Go */
  ramGB: number;
  /** Ce qui est branché (pour « bien démarrer ») */
  mail: boolean;
  calendar: boolean;
  city: boolean;
  /** Fin de la session de travail en cours (ms), 0 sinon */
  focusEnds: number;
  /** Ta journée, pour l'Accueil */
  today: Today;
  /** Ce qu'il te reste à dépenser à la boutique */
  wallet: { acorns: number };
}

export interface Today {
  /** Comment il t'appelle */
  name: string;
  /** « 14 °C, ciel dégagé à Hanoi », si on la connaît */
  weather: string;
  events: { time: string; title: string; now: boolean }[];
  /** Ta liste : ce qui reste à faire (daté ou non), puis ce que tu as fini aujourd'hui */
  tasks: { id: string; title: string; due: string; time: string; done: boolean; parent?: string }[];
  /** Les expéditeurs des mails qui attendent ta réponse */
  waiting: string[];
  /** Ce qui presse dans les projets : échéances proches ou passées, réponses attendues */
  projects: { id: string; name: string; text: string; due: string; late: boolean }[];
}

export type PrefsAction =
  | 'brief' | 'focusStop' | 'tidyNow' | 'openData' | 'downloadBrain'
  /** `arg` : l'id du cerveau à utiliser (il est téléchargé d'abord s'il le faut) */
  | 'useBrain'
  /** `arg` : la durée en minutes */
  | 'focusStart'
  /** `arg` : le texte écrit d'avance dans le champ */
  | 'say'
  | 'tryClipboard' | 'tryVision' | 'evening' | 'hide' | 'collect'
  /** La liste : `arg` = l'id, ou du JSON ({ title, due } pour ajouter, { id, title?, due? } pour changer) */
  | 'taskAdd' | 'taskEdit' | 'taskDone' | 'taskUndo' | 'taskRemove'
  /** Le cerveau découpe la tâche `arg` en quelques étapes */
  | 'taskSplit'
  /** La boutique : acheter l'objet `arg`, ou le porter (un accessoire porté se retire) */
  | 'buy' | 'wear';
export type SettingsTab = 'home' | 'chat' | 'projects' | 'guide' | 'shop' | 'journal' | 'carnet' | 'connections' | 'general';

/** API de l'onglet Réglages, sous `window.prefs` */
export interface PrefsApi {
  get(): Promise<PrefsState>;
  set(patch: Partial<Settings>): void;
  /** `arg` : la phrase écrite d'avance (« say »), l'id d'une tâche, ou du JSON (voir PrefsAction) */
  action(a: PrefsAction, arg?: string): void;
  onChange(cb: (s: PrefsState) => void): void;
  /** Le carnet de bord (stats, notes, glands) */
  journal(): Promise<JournalData>;
  onJournal(cb: (d: JournalData) => void): void;
  /** Le menu demande un autre onglet alors que la fenêtre est déjà ouverte */
  onTab(cb: (tab: SettingsTab) => void): void;
  /** Cet onglet est affiché (Gilbert s'assoit sur la branche pour discuter, sur le bord du haut sinon) */
  shown(tab: SettingsTab): void;
  /** Donne sa taille à la fenêtre du menu (les poignées d'angle et de bord) */
  resize(width: number, height: number): void;
  /** Place la fenêtre du menu (on la tire par son titre) */
  move(x: number, y: number): void;
}

/** Un message d'une discussion longue */
export interface ChatMessage {
  role: 'user' | 'gilbert';
  text: string;
  at: number;
}
export interface ChatThread {
  id: string;
  title: string;
  updated: number;
  messages: ChatMessage[];
}
export interface ChatSummary {
  id: string;
  title: string;
  updated: number;
  count: number;
}

/** API de l'onglet Discussion, sous `window.chat` */
/** Une phrase dite par Gilbert dans une bulle */
export interface SaidEntry { at: number; text: string }

export interface ChatApi {
  list(): Promise<ChatSummary[]>;
  get(id: string): Promise<ChatThread | null>;
  create(): Promise<ChatThread>;
  remove(id: string): void;
  /** Tout ce que Gilbert a dit dans ses bulles, le plus récent d'abord */
  history(): Promise<SaidEntry[]>;
  clearHistory(): void;
  /** Pose une question dans cette discussion ; la réponse arrive par `onEvent` */
  send(id: string, text: string): void;
  cancel(id: string): void;
  onEvent(cb: (ev: { chat: string; kind: 'chunk' | 'done' | 'error'; text: string }) => void): void;
}

/** API de la fenêtre du carnet, sous `window.carnet` */
export interface CarnetApi {
  get(): Promise<{ memory: Memory; lang: Lang }>;
  save(memory: Memory): void;
  forgetAll(): void;
  onChange(cb: (memory: Memory) => void): void;
}

// ---------- les projets ----------

/** En cours, en attente (bloqué, pas la main), terminé */
export type ProjectStatus = 'active' | 'paused' | 'done';

/** Ce qu'il ne faut pas oublier : une case à cocher, avec une échéance si elle existe */
export interface ProjectTodo {
  id: string;
  text: string;
  /** AAAA-MM-JJ, ou vide */
  due: string;
  done: boolean;
  /** Ajouté par Gilbert (un mail, ce qu'il a vu à l'écran) plutôt que par toi */
  auto: boolean;
  at: number;
  /** Rappels déjà faits (« j-3 », « j-1 », « jour », « retard:AAAA-MM-JJ ») */
  reminded?: string[];
}

/** Une info que Gilbert a relevée (« Dernières infos ») */
export interface ProjectNote {
  id: string;
  at: number;
  text: string;
  /** D'où vient l'info : un mail, ce qu'il a vu à l'écran, la discussion, ou toi */
  source: 'mail' | 'screen' | 'chat' | 'manual';
}

/** Une fiche de suivi : un document par projet, que Gilbert tient à jour et que tu peux modifier */
export interface Project {
  id: string;
  name: string;
  /** Au choix (« Travail », « Perso »…), pour ranger la liste */
  category: string;
  status: ProjectStatus;
  /** Noms, adresses mail, mots à reconnaître dans les mails, l'agenda et l'écran */
  keywords: string[];
  /** Courte description : de quoi il s'agit */
  description: string;
  /** Le rapport d'avancement, en quelques phrases */
  progress: string;
  /** Gilbert le réécrit tout seul tant que tu n'y as pas touché */
  progressAuto: boolean;
  todos: ProjectTodo[];
  /** Les infos relevées par Gilbert, les plus récentes d'abord */
  notes: ProjectNote[];
  /** Ton texte libre */
  doc: string;
  createdAt: number;
  updatedAt: number;
  /** Dernière fois qu'il t'a vu travailler dessus (écran) */
  seenAt: number;
}

/** Une recommandation de Gilbert pour un projet (« Répondre à Paul », « Relancer… ») */
export interface ProjectAdvice {
  /** Stable : « écartée » le reste */
  id: string;
  kind: 'reply' | 'quiet' | 'prepare';
  text: string;
  /** Il peut rédiger un brouillon (copié dans le presse-papiers) */
  draft: boolean;
}

export interface ProjectView {
  project: Project;
  /** Part des cases cochées (0 à 100), -1 s'il n'y en a pas */
  percent: number;
  advice: ProjectAdvice[];
  events: { when: string; title: string }[];
  mails: { from: string; summary: string; when: string }[];
}

export type ProjectOp =
  | { type: 'add'; name: string; category: string; keywords: string; description: string }
  | { type: 'edit'; id: string; patch: Partial<Pick<Project, 'name' | 'category' | 'status' | 'description' | 'progress' | 'doc'> & { keywords: string[] | string }> }
  | { type: 'remove'; id: string }
  /** Gilbert réécrit le rapport d'avancement maintenant */
  | { type: 'report'; id: string }
  | { type: 'todoAdd'; id: string; text: string; due: string }
  | { type: 'todoEdit'; id: string; todoId: string; patch: Partial<Pick<ProjectTodo, 'text' | 'due' | 'done'>> }
  | { type: 'todoRemove'; id: string; todoId: string }
  | { type: 'noteRemove'; id: string; noteId: string }
  | { type: 'dismiss'; id: string; adviceId: string }
  /** Gilbert rédige le brouillon de cette recommandation et le copie */
  | { type: 'draft'; id: string; adviceId: string };

/** API de l'onglet Projets, sous `window.projects` */
export interface ProjectsApi {
  get(): Promise<{ projects: ProjectView[]; categories: string[]; lang: Lang }>;
  act(op: ProjectOp): void;
  onChange(cb: () => void): void;
}
