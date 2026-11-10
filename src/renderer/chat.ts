// Champ de saisie pixel qui s'ouvre au-dessus de Gilbert : discussion libre, ou réponse
// à une question (« faire connaissance »), auquel cas la question reste affichée au-dessus.

import { containsPoint, placeAbove } from './bubble';

export interface AskOptions {
  /** Question affichée au-dessus du champ */
  prompt?: string;
  /** Remplace le traitement par défaut pour cette saisie */
  onSubmit?: (text: string) => void;
  onCancel?: () => void;
  /** Entrée sur un champ vide envoie quand même (pour « passer ») */
  allowEmpty?: boolean;
  /** Texte déjà écrit dans le champ (le guide : il n'y a plus qu'à appuyer sur Entrée) */
  value?: string;
}

export type MusicCmd = 'play' | 'pause' | 'next' | 'previous';
interface NowPlaying { player: string; playing: boolean; title: string; artist: string }

/** Pictogrammes pixel (une case = 2 px) */
const ICONS: Record<string, string[]> = {
  previous: ['X...X', 'X..XX', 'X.XXX', 'X..XX', 'X...X'],
  next: ['X...X', 'XX..X', 'XXX.X', 'XX..X', 'X...X'],
  play: ['X...', 'XX..', 'XXX.', 'XX..', 'X...'],
  pause: ['XX.XX', 'XX.XX', 'XX.XX', 'XX.XX', 'XX.XX'],
};
function icon(name: string) {
  const rows = ICONS[name];
  const d = rows.flatMap((r, y) => [...r.matchAll(/X+/g)].map((m) => `M${m.index} ${y}h${m[0].length}v1h-${m[0].length}z`)).join('');
  return `<svg viewBox="0 0 ${rows[0].length} ${rows.length}" width="${rows[0].length * 2}" height="${rows.length * 2}" shape-rendering="crispEdges" aria-hidden="true"><path d="${d}"/></svg>`;
}

export class ChatBox {
  private input: HTMLInputElement;
  private promptEl: HTMLElement;
  private opts: AskOptions = {};
  open = false;
  private musicEl: HTMLElement;
  /** Lance une commande de musique et renvoie ce qui joue ensuite */
  onMusicCommand: ((cmd: MusicCmd) => Promise<NowPlaying>) | null = null;
  /** Les trois petits points : ouvrir la fenêtre des réglages */
  onSettings: (() => void) | null = null;
  /** Le micro : démarrer ou arrêter une note vocale */
  onMic: (() => void) | null = null;

  constructor(
    private el: HTMLElement,
    private onSubmit: (text: string) => void,
    private onClose: () => void,
  ) {
    this.input = el.querySelector('input')!;
    this.promptEl = el.querySelector('.chat-prompt')!;
    this.musicEl = el.querySelector('.chat-music')!;
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
      if (e.key === 'Enter') {
        const text = this.input.value.trim();
        if (!text && !this.opts.allowEmpty) {
          this.close();
          return;
        }
        const submit = this.opts.onSubmit ?? this.onSubmit;
        this.close(false);
        submit(text);
      }
    });
    el.addEventListener('mousedown', (e) => e.stopPropagation());
    el.querySelector('.chat-mic')!.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.onMic?.();
    });
    el.querySelector('.chat-more')!.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.close();
      this.onSettings?.();
    });
  }

  show(placeholder: string, opts: AskOptions = {}) {
    this.opts = opts;
    this.open = true;
    this.el.hidden = false;
    this.promptEl.hidden = !opts.prompt;
    this.promptEl.textContent = opts.prompt ?? '';
    this.input.placeholder = placeholder;
    this.input.value = opts.value ?? '';
    this.input.classList.remove('live');
    // le focus clavier n'arrive qu'une fois la fenêtre devenue « focusable »
    setTimeout(() => {
      this.input.focus();
      this.input.setSelectionRange(this.input.value.length, this.input.value.length);
    }, 30);
  }

  /** Ferme le champ ; `cancelled` = fermé sans rien envoyer */
  close(cancelled = true) {
    if (!this.open) return;
    this.open = false;
    this.el.hidden = true;
    this.musicEl.hidden = true;
    this.input.blur();
    if (cancelled) (this.opts.onCancel ?? this.onClose)();
  }

  place(cx: number, top: number) {
    placeAbove(this.el, cx, top);
  }

  contains(x: number, y: number) {
    return containsPoint(this.el, x, y) || containsPoint(this.musicEl, x, y);
  }

  /**
   * Quand une musique joue : trois boutons pixel et le titre qui défile, au-dessus de la bulle, sans fond.
   * `null` (rien ne joue) : la bande disparaît.
   */
  setMusic(t: NowPlaying | null) {
    if (!this.open || !t || !t.player || !t.title) { this.musicEl.hidden = true; return; }
    const btn = (cmd: MusicCmd, name: string, label: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = label;
      if (cmd === 'play' || cmd === 'pause') b.className = 'main';
      b.setAttribute('aria-label', label);
      b.innerHTML = icon(name);
      b.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onMusicCommand?.(cmd).then((n) => this.setMusic(n)).catch(() => {});
      });
      return b;
    };
    const label = t.artist ? `${t.title} — ${t.artist}` : t.title;
    const track = document.createElement('span');
    track.className = 'track';
    const inner = document.createElement('span');
    inner.className = 'run';
    // le texte est doublé : en défilant d'une moitié, la boucle est invisible
    inner.append(Object.assign(document.createElement('span'), { textContent: label }), Object.assign(document.createElement('span'), { textContent: label }));
    track.append(inner);
    this.musicEl.replaceChildren(btn('previous', 'previous', 'Précédent'), btn(t.playing ? 'pause' : 'play', t.playing ? 'pause' : 'play', t.playing ? 'Pause' : 'Play'), btn('next', 'next', 'Suivant'), track);
    this.musicEl.hidden = false;
    // ne défile que si le titre est trop long pour la place
    requestAnimationFrame(() => {
      const w = (inner.firstElementChild as HTMLElement).offsetWidth;
      const fits = w <= track.clientWidth;
      inner.classList.toggle('scroll', !fits);
      inner.lastElementChild?.toggleAttribute('hidden', fits);
      inner.style.setProperty('--run', `${Math.max(6, Math.round(w / 24))}s`);
    });
  }

  /** État du micro : en écoute (rouge qui pulse), en train de transcrire (jaune), ou rien */
  setMic(state: 'off' | 'recording' | 'busy') {
    const b = this.el.querySelector('.chat-mic')!;
    b.classList.toggle('recording', state === 'recording');
    b.classList.toggle('busy', state === 'busy');
    this.input.placeholder = state === 'recording' ? '…' : this.input.placeholder;
  }

  /** Écrit dans le champ : ce que Whisper entend (`live`, en grisé), puis le texte final, à relire avant Entrée */
  setDraft(text: string, live = false) {
    if (!this.open) return;
    this.input.value = text;
    this.input.classList.toggle('live', live);
    this.input.scrollLeft = this.input.scrollWidth;
    if (!live) {
      this.input.focus();
      this.input.setSelectionRange(text.length, text.length);
    }
  }

  /** Envoie un texte comme s'il avait été tapé (note vocale) */
  send(text: string) {
    const submit = this.opts.onSubmit ?? this.onSubmit;
    this.close(false);
    submit(text);
  }
}
