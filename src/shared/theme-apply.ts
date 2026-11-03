// Clair ou sombre : le réglage « Apparence » (auto = comme le système). L'attribut data-theme de <html> est lu
// par shared/theme.css ; il est posé tout de suite (selon le système), puis ajusté quand les réglages arrivent.

import type { Settings } from './types';

const system = window.matchMedia('(prefers-color-scheme: dark)');
let pref: Settings['theme'] = 'auto';

function paint() {
  document.documentElement.dataset.theme = pref === 'dark' || (pref === 'auto' && system.matches) ? 'dark' : 'light';
}

export function applyTheme(next: Settings['theme'] | undefined) {
  pref = next === 'light' || next === 'dark' ? next : 'auto';
  paint();
}

system.addEventListener('change', paint);
paint();
