// « Enregistré » : une pastille discrète en bas à droite de la fenêtre, un instant, après chaque changement.

const TEXT: Record<string, string> = { fr: 'Enregistré', en: 'Saved', vi: 'Đã lưu' };
let el: HTMLElement | null = null;
let timer = 0;

export function saved() {
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = TEXT[document.documentElement.lang] ?? TEXT.fr;
  el.classList.add('on');
  clearTimeout(timer);
  timer = window.setTimeout(() => el?.classList.remove('on'), 1400);
}
