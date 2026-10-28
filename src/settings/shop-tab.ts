// L'onglet Boutique : Gilbert en grand, ce qu'il te reste, puis les pelages et les accessoires.
// Survoler un objet le lui fait essayer ; « Acheter » demande une confirmation (deuxième clic).

import sheetUrl from '../../assets/gilbert.png';
import atlas from '../../assets/gilbert.json';
import { ACORN, GOLDEN_ACORN, drawGrid } from '../shared/pixels';
import { SHOP, paintSkin, type Item, type Skin } from '../shared/skins';
import type { Lang, PrefsState } from '../shared/types';

const T = {
  fr: {
    title: 'La boutique', hint: 'Passe la souris sur un objet pour le lui faire essayer.',
    wallet: (n: number) => `${n} gland${n > 1 ? 's' : ''}`, golden: (n: number) => `${n} doré${n > 1 ? 's' : ''}`,
    furs: 'Pelages', accessories: 'Accessoires',
    wearing: 'Porté', wear: 'Porter', remove: 'Retirer', buy: 'Acheter', sure: 'Sûr ?', missing: (n: number, golden: boolean) => `Il manque ${n}${golden ? ' doré' + (n > 1 ? 's' : '') : ''}`,
    free: 'Offert',
  },
  en: {
    title: 'The shop', hint: 'Hover over an item to have him try it on.',
    wallet: (n: number) => `${n} acorn${n > 1 ? 's' : ''}`, golden: (n: number) => `${n} golden`,
    furs: 'Fur', accessories: 'Accessories',
    wearing: 'Wearing', wear: 'Wear', remove: 'Take off', buy: 'Buy', sure: 'Sure?', missing: (n: number, golden: boolean) => `${n}${golden ? ' golden' : ''} short`,
    free: 'Free',
  },
  vi: {
    title: 'Cửa hàng', hint: 'Rê chuột lên một món để tớ mặc thử.',
    wallet: (n: number) => `${n} quả sồi`, golden: (n: number) => `${n} quả vàng`,
    furs: 'Bộ lông', accessories: 'Phụ kiện',
    wearing: 'Đang mặc', wear: 'Mặc', remove: 'Cởi ra', buy: 'Mua', sure: 'Chắc chưa?', missing: (n: number, golden: boolean) => `Thiếu ${n}${golden ? ' quả vàng' : ''}`,
    free: 'Miễn phí',
  },
};

function h<E extends HTMLElement = HTMLElement>(tag: string, props: Record<string, unknown> = {}, ...children: (Node | string)[]): E {
  const el = Object.assign(document.createElement(tag), props) as E;
  el.append(...children);
  return el;
}

// ---------- la planche, habillée à la demande ----------

let original: ImageData | null = null;
const loading = new Promise<void>((ok) => {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    original = ctx.getImageData(0, 0, img.width, img.height);
    ok();
  };
  img.src = sheetUrl;
});
const painted = new Map<string, HTMLCanvasElement>();

function sheetFor(skin: Skin) {
  const key = `${skin.fur}/${skin.accessory}`;
  let c = painted.get(key);
  if (!c && original) {
    c = document.createElement('canvas');
    c.width = original.width;
    c.height = original.height;
    c.getContext('2d')!.putImageData(paintSkin(original, atlas, skin), 0, 0);
    painted.set(key, c);
  }
  return c ?? null;
}

/** La pose assise, cadrée sur Gilbert (couronne comprise), à l'échelle `scale` */
const CROP = { x: 12, y: 21, w: 30, h: 23 };
function portrait(canvas: HTMLCanvasElement, skin: Skin, scale: number, crop = CROP) {
  canvas.width = crop.w * scale;
  canvas.height = crop.h * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const sheet = sheetFor(skin);
  if (!sheet) return;
  const i = atlas.frames.idle0, S = atlas.size;
  ctx.drawImage(sheet, (i % atlas.cols) * S + crop.x, Math.floor(i / atlas.cols) * S + crop.y, crop.w, crop.h, 0, 0, crop.w * scale, crop.h * scale);
}

/** La tête seule (pour les accessoires) */
const HEAD = { x: 14, y: 22, w: 18, h: 15 };

function acorn(golden: boolean) {
  const c = h<HTMLCanvasElement>('canvas', { width: 20, height: 20, className: 'acorn-small' });
  drawGrid(c.getContext('2d')!, golden ? GOLDEN_ACORN : ACORN, 0, 0, 2);
  return c;
}

const price = (item: Item, t: typeof T.fr) => (item.price.golden
  ? h('span', { className: 'price' }, acorn(true), String(item.price.golden))
  : item.price.acorns ? h('span', { className: 'price' }, acorn(false), String(item.price.acorns)) : h('span', { className: 'price' }, t.free));

// ---------- l'onglet ----------

/** L'objet dont l'achat attend sa confirmation (deuxième clic dans les 3 s) */
let confirming = '';

export function renderShop(el: HTMLElement, state: PrefsState, lang: Lang, act: (a: 'buy' | 'wear', id: string) => void) {
  const t = T[lang];
  const s = state.settings;
  const w = state.wallet;
  const hero = h<HTMLCanvasElement>('canvas', { className: 'hero' });
  const tryOn = (skin: Skin) => portrait(hero, skin, 6);

  const card = (item: Item) => {
    const owned = s.owned.includes(item.id);
    const worn = item.kind === 'fur' ? s.skin.fur === item.id : s.skin.accessory === item.id;
    const trial: Skin = item.kind === 'fur' ? { ...s.skin, fur: item.id } : { ...s.skin, accessory: item.id };
    const thumb = h<HTMLCanvasElement>('canvas', { className: 'thumb' });
    if (item.kind === 'fur') portrait(thumb, { fur: item.id, accessory: '' }, 3);
    else portrait(thumb, { fur: s.skin.fur, accessory: item.id }, 4, HEAD);

    const short = item.price.golden ? item.price.golden - w.golden : item.price.acorns - w.acorns;
    const b = h<HTMLButtonElement>('button', {});
    if (worn) {
      b.textContent = item.kind === 'accessory' ? t.remove : t.wearing;
      b.className = 'ghost';
      b.disabled = item.kind === 'fur';
      b.addEventListener('click', () => act('wear', item.id));
    } else if (owned) {
      b.textContent = t.wear;
      b.addEventListener('click', () => act('wear', item.id));
    } else if (short > 0) {
      b.textContent = t.missing(short, item.price.golden > 0);
      b.className = 'ghost';
      b.disabled = true;
    } else {
      b.textContent = confirming === item.id ? t.sure : t.buy;
      b.className = confirming === item.id ? 'confirm' : '';
      b.addEventListener('click', () => {
        if (confirming === item.id) {
          confirming = '';
          act('buy', item.id);
          return;
        }
        confirming = item.id;
        b.textContent = t.sure;
        b.className = 'confirm';
        setTimeout(() => {
          if (confirming !== item.id) return;
          confirming = '';
          b.textContent = t.buy;
          b.className = '';
        }, 3000);
      });
    }
    const c = h('div', { className: `item${worn ? ' worn' : ''}${owned ? ' owned' : ''}` }, thumb, h('b', {}, item.name[lang]),
      owned ? h('span', { className: 'price' }, worn ? t.wearing : '✓') : price(item, t), b);
    c.addEventListener('mouseenter', () => tryOn(trial));
    c.addEventListener('mouseleave', () => tryOn(s.skin));
    return c;
  };

  const draw = () => {
    tryOn(s.skin);
    el.replaceChildren(
      h('section', { className: 'shop-hero' }, hero, h('div', {},
        h('h2', {}, t.title),
        h('p', { className: 'wallet' }, acorn(false), t.wallet(w.acorns), ...(w.golden ? [acorn(true), t.golden(w.golden)] : [])),
        h('p', { className: 'empty' }, t.hint))),
      h('section', {}, h('h2', {}, t.furs), h('div', { className: 'items' }, ...SHOP.furs.map(card))),
      h('section', {}, h('h2', {}, t.accessories), h('div', { className: 'items' }, ...SHOP.accessories.map(card))),
    );
  };
  if (original) draw();
  else loading.then(draw);
}
