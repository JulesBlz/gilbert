// Clair ou sombre : le réglage « Apparence » (clair par défaut ; « Système » suit celui de l'ordinateur). L'attribut
// data-theme de <html> est lu par shared/theme.css ; il est posé tout de suite en clair, puis ajusté dès que les
// réglages sont connus, de la même façon dans le menu et sur le bureau (bulles de Gilbert).

import type { Settings } from './types';

const system = window.matchMedia('(prefers-color-scheme: dark)');
let pref: Settings['theme'] = 'light';

function paint() {
  document.documentElement.dataset.theme = pref === 'dark' || (pref === 'auto' && system.matches) ? 'dark' : 'light';
}

export function applyTheme(next: Settings['theme'] | undefined) {
  pref = next === 'dark' || next === 'auto' ? next : 'light';
  paint();
}

system.addEventListener('change', paint);
paint();
