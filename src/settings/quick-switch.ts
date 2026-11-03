// La recherche rapide (⌘K) : une seule ligne pour aller n'importe où (une page, un projet, une discussion)
// ou lancer une action (nouvelle discussion, nouveau projet). Flèches et Entrée, Échap pour fermer.

import type { Lang } from '../shared/types';

export interface QuickItem {
  label: string;
  /** Ce qui est écrit à droite : « Page », « Projet »… ou un raccourci */
  hint: string;
  run: () => void;
}

const T = {
  fr: { placeholder: 'Aller à… (page, projet, discussion)', empty: 'Rien de tel.', keys: '↑↓ choisir · Entrée ouvrir · Échap fermer' },
  en: { placeholder: 'Go to… (page, project, chat)', empty: 'No match.', keys: '↑↓ choose · Enter open · Esc close' },
  vi: { placeholder: 'Đi tới… (trang, dự án, cuộc trò chuyện)', empty: 'Không thấy.', keys: '↑↓ chọn · Enter mở · Esc đóng' },
};

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

export function mountQuickSwitch(items: () => Promise<QuickItem[]>, lang: () => Lang) {
  const root = document.createElement('div');
  root.className = 'qs';
  root.hidden = true;
  const input = document.createElement('input');
  input.type = 'text';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'true');
  const list = document.createElement('ul');
  list.className = 'qs-list';
  list.setAttribute('role', 'listbox');
  const keys = document.createElement('div');
  keys.className = 'qs-hint';
  const box = document.createElement('div');
  box.className = 'qs-box';
  box.append(input, list, keys);
  root.append(box);
  document.body.append(root);

  let all: QuickItem[] = [];
  let shown: QuickItem[] = [];
  let at = 0;
  let previous: Element | null = null;

  const draw = () => {
    const q = fold(input.value.trim());
    shown = (q ? all.filter((i) => fold(`${i.label} ${i.hint}`).includes(q)) : all).slice(0, 30);
    at = Math.min(at, Math.max(shown.length - 1, 0));
    if (!shown.length) {
      const none = document.createElement('li');
      none.className = 'qs-empty';
      none.textContent = (T[lang()] ?? T.fr).empty;
      list.replaceChildren(none);
      return;
    }
    list.replaceChildren(...shown.map((item, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = i === at ? 'on' : '';
      b.setAttribute('role', 'option');
      const hint = document.createElement('small');
      hint.textContent = item.hint;
      b.append(item.label, hint);
      b.addEventListener('mousemove', () => { if (at !== i) { at = i; draw(); } });
      b.addEventListener('click', () => choose(i));
      li.append(b);
      return li;
    }));
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };

  const close = () => {
    if (root.hidden) return;
    root.hidden = true;
    (previous as HTMLElement | null)?.focus?.();
  };

  const choose = (i: number) => {
    const item = shown[i];
    close();
    item?.run();
  };

  input.addEventListener('input', () => { at = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.min(at + 1, shown.length - 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(at - 1, 0); draw(); }
    else if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); choose(at); }
  });
  root.addEventListener('mousedown', (e) => { if (e.target === root) close(); });

  return {
    isOpen: () => !root.hidden,
    close,
    async open() {
      previous = document.activeElement;
      const text = T[lang()] ?? T.fr;
      input.placeholder = text.placeholder;
      keys.textContent = text.keys;
      input.value = '';
      at = 0;
      all = await items().catch(() => []);
      root.hidden = false;
      draw();
      input.focus();
    },
  };
}
