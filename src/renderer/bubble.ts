// Bulle de dialogue pixel : texte qui s'écrit lettre par lettre, réponse du cerveau
// qui arrive en direct, petits points pendant qu'il réfléchit, et boutons de choix.

export interface SayOptions {
  onChar?: (ch: string) => void;
  onDone?: () => void;
  /** Boutons affichés sous le texte ; la bulle reste ouverte tant qu'on n'a pas choisi */
  actions?: { label: string; run: () => void }[];
  /** Un long texte (une traduction, un résumé) : bulle plus large, écrit plus vite */
  long?: boolean;
}

export interface Stream {
  push(text: string): void;
  end(): void;
}

const delayAfter = (ch: string) => (ch === ' ' ? 25 : /[.,!?…:;]/.test(ch) ? 180 : 38);

/**
 * Place un élément au-dessus du point (cx, y) — ou en dessous avec `below` —
 * sans sortir de l'écran, avec sa queue pointée vers Gilbert
 */
export function placeAbove(el: HTMLElement, cx: number, y0: number, below = false) {
  if (el.hidden) return;
  el.classList.toggle('below', below);
  const w = el.offsetWidth, h = el.offsetHeight;
  const margin = 10;
  const left = Math.round(Math.min(Math.max(cx - w / 2, margin), innerWidth - w - margin));
  const y = Math.round(below ? y0 + 16 : Math.max(y0 - h - 16, margin));
  el.style.transform = `translate(${left}px, ${y}px)`;
  const tail = Math.min(Math.max(cx - left, 14), w - 14);
  el.style.setProperty('--tail-x', `${Math.round(tail)}px`);
}

export function containsPoint(el: HTMLElement, x: number, y: number) {
  if (el.hidden) return false;
  const r = el.getBoundingClientRect();
  return x >= r.left - 3 && x <= r.right + 3 && y >= r.top - 3 && y <= r.bottom + 12;
}

export class Bubble {
  private text: HTMLElement;
  private buttons: HTMLElement;
  private typing: number | null = null;
  private hideTimer: number | null = null;
  private dots: number | null = null;
  private sticky = false;
  visible = false;

  constructor(private el: HTMLElement) {
    this.text = el.querySelector('.bubble-text')!;
    this.buttons = el.querySelector('.bubble-actions')!;
    el.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      // un clic sur la bulle la ferme, sauf si elle attend un choix
      if (!this.sticky) this.hide();
    });
  }

  say(message: string, opts: SayOptions = {}) {
    this.open();
    this.el.classList.toggle('long', Boolean(opts.long));
    this.setActions(opts.actions);
    const pace = opts.long ? 0.35 : 1;

    // le texte complet est posé d'emblée (invisible) pour que la bulle ne change pas de taille
    const shown = document.createElement('span');
    const rest = document.createElement('span');
    rest.className = 'rest';
    rest.textContent = message;
    this.text.replaceChildren(shown, rest);

    const chars = [...message];
    let i = 0;
    const next = () => {
      if (i >= chars.length) {
        this.typing = null;
        this.finish(chars.length, opts);
        return;
      }
      const ch = chars[i++];
      shown.textContent += ch;
      rest.textContent = chars.slice(i).join('');
      opts.onChar?.(ch);
      this.typing = window.setTimeout(next, delayAfter(ch) * pace);
    };
    next();
  }

  /** Petits points animés pendant que Gilbert réfléchit */
  think() {
    this.open();
    this.setActions();
    // trois points toujours là, seuls les derniers sont masqués : la bulle garde sa taille
    const dots = [0, 1, 2].map(() => Object.assign(document.createElement('span'), { textContent: '.' }));
    this.text.replaceChildren(...dots);
    let n = 0;
    const tick = () => {
      n = (n % 3) + 1;
      dots.forEach((d, j) => { d.style.visibility = j < n ? 'visible' : 'hidden'; });
    };
    tick();
    this.dots = window.setInterval(tick, 350);
  }

  /** Bulle alimentée au fil de l'eau (réponse du cerveau), écrite à vitesse de lecture */
  stream(opts: SayOptions = {}): Stream {
    this.open();
    this.setActions();
    const shown = document.createElement('span');
    this.text.replaceChildren(shown);
    const queue: string[] = [];
    let ended = false;
    let count = 0;

    const tick = () => {
      const ch = queue.shift();
      if (ch !== undefined) {
        // les espaces de début de réponse ne s'affichent pas
        if (count === 0 && /\s/.test(ch)) { this.typing = window.setTimeout(tick, 0); return; }
        shown.textContent += ch;
        count++;
        opts.onChar?.(ch);
        this.typing = window.setTimeout(tick, delayAfter(ch) * 0.8);
      } else if (ended) {
        this.typing = null;
        this.finish(count, opts);
      } else {
        this.typing = window.setTimeout(tick, 40);
      }
    };
    tick();

    return {
      push: (t) => queue.push(...t),
      end: () => { ended = true; },
    };
  }

  hide() {
    if (!this.visible) return;
    this.clearTimers();
    this.sticky = false;
    this.el.classList.add('fading');
    this.visible = false;
    this.hideTimer = window.setTimeout(() => {
      this.el.hidden = true;
    }, 250);
  }

  place(cx: number, y: number, below = false) {
    placeAbove(this.el, cx, y, below);
  }

  contains(x: number, y: number) {
    return containsPoint(this.el, x, y);
  }

  private open() {
    this.clearTimers();
    this.el.classList.remove('long');
    this.el.hidden = false;
    this.el.classList.remove('fading');
    this.visible = true;
  }

  private finish(length: number, opts: SayOptions) {
    opts.onDone?.();
    if (this.sticky) return;
    this.hideTimer = window.setTimeout(() => this.hide(), Math.max(2600, length * 75));
  }

  private setActions(actions: SayOptions['actions'] = []) {
    this.sticky = actions.length > 0;
    this.buttons.hidden = !this.sticky;
    this.buttons.replaceChildren(...actions.map(({ label, run }) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.sticky = false;
        this.hide();
        run();
      });
      return b;
    }));
  }

  private clearTimers() {
    if (this.typing) clearTimeout(this.typing);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    if (this.dots) clearInterval(this.dots);
    this.typing = this.hideTimer = this.dots = null;
  }
}
