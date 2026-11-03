// L'onglet Discussion. À gauche, une colonne : « + Nouvelle », les conversations (la choisie est plus
// foncée), puis Gilbert, tourné vers le fil. À droite, le fil : ses bulles pointent vers lui, les messages
// s'empilent en bas, près de lui et de la saisie. Entrée envoie, Échap arrête ce qu'il écrit.

import { LOCALE, type ChatApi, type ChatMessage, type ChatSummary, type ChatThread, type Lang } from '../shared/types';
import { tiny } from './icons';

const T = {
  fr: {
    untitled: 'Nouvelle discussion', newer: 'Nouvelle discussion', greeting: 'Salut ! On parle de quoi ?',
    placeholder: 'Écris à Gilbert…', writing: 'Gilbert écrit… (Échap pour arrêter)', del: 'Supprimer', sure: 'Sûr ?', copy: 'Copier', copied: 'Copié',
    suggestions: ['Qu’est-ce que j’ai à faire aujourd’hui ?', 'Aide-moi à écrire un message', 'Cherche une idée de week-end'],
    none: 'Aucune discussion.', error: 'Oups : ', today: 'Aujourd’hui', yesterday: 'Hier', earlier: 'Avant',
  },
  en: {
    untitled: 'New chat', newer: 'New chat', greeting: 'Hi! What shall we talk about?',
    placeholder: 'Write to Gilbert…', writing: 'Gilbert is writing… (Esc to stop)', del: 'Delete', sure: 'Sure?', copy: 'Copy', copied: 'Copied',
    suggestions: ['What do I have to do today?', 'Help me write a message', 'Find me a weekend idea'],
    none: 'No chats.', error: 'Oops: ', today: 'Today', yesterday: 'Yesterday', earlier: 'Earlier',
  },
  vi: {
    untitled: 'Cuộc trò chuyện mới', newer: 'Cuộc trò chuyện mới', greeting: 'Chào cậu! Mình nói chuyện gì nào?',
    placeholder: 'Viết cho Gilbert…', writing: 'Gilbert đang viết… (Esc để dừng)', del: 'Xóa', sure: 'Chắc chưa?', copy: 'Sao chép', copied: 'Đã chép',
    suggestions: ['Hôm nay tớ phải làm gì?', 'Giúp tớ viết một tin nhắn', 'Tìm ý tưởng cho cuối tuần'],
    none: 'Chưa có cuộc trò chuyện.', error: 'Ôi: ', today: 'Hôm nay', yesterday: 'Hôm qua', earlier: 'Trước đó',
  },
};

function h<E extends HTMLElement = HTMLElement>(tag: string, props: Record<string, unknown> = {}, ...children: (Node | string)[]): E {
  const el = Object.assign(document.createElement(tag), props) as E;
  el.append(...children);
  return el;
}

/** La réponse et, si elle a cherché sur internet, les sites cités (la dernière ligne « Sources : … ») */
const SOURCES = /\n?(?:Sources?|Nguồn) : (.+)$/;
function split(text: string) {
  const m = SOURCES.exec(text);
  return m ? { body: text.slice(0, m.index), sources: m[1].split(',').map((x) => x.trim()).filter(Boolean) } : { body: text, sources: [] as string[] };
}

export function mountChat(el: HTMLElement, chat: ChatApi, lang: () => Lang) {
  const t = () => T[lang()] ?? T.fr;
  const when = (at: number, opts: Intl.DateTimeFormatOptions) => new Date(at).toLocaleString(LOCALE[lang()], opts);
  let threads: ChatSummary[] = [];
  let current: ChatThread | null = null;
  /** La réponse qui s'écrit, lettre après lettre : ce qui est arrivé (`target`) et ce qui est déjà affiché (`shown`) */
  let typing: { box: HTMLElement; target: string; full: string; shown: number; finished: boolean; hold: number; fast: boolean } | null = null;
  let ticker: ReturnType<typeof setInterval> | null = null;

  const newBtn = h<HTMLButtonElement>('button', { type: 'button', className: 'chat-new' });
  const list = h('div', { className: 'chat-list' });
  const msgs = h('div', { className: 'chat-msgs' });
  const input = h<HTMLTextAreaElement>('textarea', { rows: 1, className: 'chat-input' });

  const bubble = (m: ChatMessage) => {
    const mine = m.role === 'user';
    const { body, sources } = mine ? { body: m.text, sources: [] as string[] } : split(m.text);
    const col = h('div', { className: 'col' }, h('div', { className: 'text' }, body));
    if (sources.length) col.append(h('div', { className: 'sources' }, ...sources.map((s) => h('span', { className: 'src' }, s))));
    // l'heure et « copier » flottent sous la bulle au survol : ils ne prennent pas de place au repos
    const meta = h('div', { className: 'meta' }, h('small', {}, when(m.at, { hour: '2-digit', minute: '2-digit' })));
    if (!mine) {
      const copy = h<HTMLButtonElement>('button', { type: 'button', className: 'copy', title: t().copy }, tiny('copy'));
      copy.addEventListener('click', () => {
        navigator.clipboard?.writeText(m.text).catch(() => {});
        copy.title = t().copied;
        copy.classList.add('done');
        setTimeout(() => { copy.title = t().copy; copy.classList.remove('done'); }, 1200);
      });
      meta.append(copy);
    }
    col.append(meta);
    return h('div', { className: `msg ${mine ? 'mine' : 'his'}` }, col);
  };
  const scroll = () => { msgs.scrollTop = msgs.scrollHeight; };

  const group = (at: number) => {
    const d = new Date(at), now = new Date();
    const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000);
    return days <= 0 ? t().today : days === 1 ? t().yesterday : t().earlier;
  };

  // ----- les conversations : une colonne de titres, la choisie plus foncée -----
  const drawList = () => {
    const rows = threads.filter((x) => x.count > 0 || x.id === current?.id).map((c) => {
      const open = h<HTMLButtonElement>('button', { type: 'button', className: 'conv-open', title: c.title || t().untitled, textContent: c.title || t().untitled });
      open.addEventListener('click', () => select(c.id));
      const del = h<HTMLButtonElement>('button', { type: 'button', className: 'conv-del', title: t().del }, tiny('trash'));
      del.addEventListener('click', async () => {
        // deux clics : le premier demande confirmation, le second supprime
        if (!del.classList.contains('sure')) {
          del.classList.add('sure');
          del.replaceChildren(t().sure);
          setTimeout(() => { if (del.classList.contains('sure')) { del.classList.remove('sure'); del.replaceChildren(tiny('trash')); } }, 3000);
          return;
        }
        chat.remove(c.id);
        const wasCurrent = current?.id === c.id;
        threads = await chat.list();
        if (wasCurrent) { current = null; const next = threads.find((x) => x.count > 0); if (next) await select(next.id); else await fresh(); }
        else drawList();
      });
      return h('div', { className: `conv${current?.id === c.id ? ' on' : ''}` }, open, del);
    });
    list.replaceChildren(...rows);
  };

  const stopTyping = () => {
    if (ticker) clearInterval(ticker);
    ticker = null;
    typing = null;
  };

  const labels = () => {
    newBtn.replaceChildren(tiny('plus'), t().newer);
    input.placeholder = typing ? t().writing : t().placeholder;
  };

  const drawThread = () => {
    stopTyping();
    if (current?.messages.length) {
      msgs.replaceChildren(...current.messages.map(bubble));
    } else {
      // une discussion vide : il dit bonjour, et propose de quoi commencer (des liens, pas des boîtes)
      msgs.replaceChildren(h('div', { className: 'msg his' }, h('div', { className: 'col' }, h('div', { className: 'text' }, t().greeting))),
        h('div', { className: 'chat-start' }, ...t().suggestions.map((q) => {
          const link = h<HTMLButtonElement>('button', { type: 'button', className: 'ask', textContent: q });
          link.addEventListener('click', () => { input.value = q; send(); });
          return link;
        })));
    }
    labels();
    scroll();
  };

  async function select(id: string) {
    current = await chat.get(id);
    threads = await chat.list();
    drawList();
    drawThread();
    input.focus();
  }

  async function fresh() {
    // une discussion vide existe déjà : on s'y met plutôt que d'en empiler
    const empty = threads.find((s) => s.count === 0);
    if (empty) return select(empty.id);
    current = await chat.create();
    threads = await chat.list();
    drawList();
    drawThread();
    input.focus();
  }

  const grow = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
  };

  async function send() {
    const text = input.value.trim();
    if (!text || typing) return;
    if (!current) await fresh();
    if (!current) return;
    input.value = '';
    grow();
    const m: ChatMessage = { role: 'user', text, at: Date.now() };
    if (!current.messages.length) msgs.replaceChildren();
    current.messages.push(m);
    msgs.append(bubble(m));
    // il réfléchit : trois points qui sautent
    const wait = h('div', { className: 'msg his waiting' }, h('div', { className: 'col' }, h('div', { className: 'text' }, h('span', { className: 'dots' }, h('i'), h('i'), h('i')))));
    msgs.append(wait);
    typing = { box: wait.querySelector('.text')!, target: '', full: '', shown: 0, finished: false, hold: 0, fast: false };
    scroll();
    chat.send(current.id, text);
    threads = await chat.list();
    labels();
    drawList();
  }

  /** Une lettre de plus (deux ou quatre quand la réponse est déjà loin devant) ; une courte pause après la ponctuation */
  const tick = () => {
    const w = typing;
    if (!w || !current) return stopTyping();
    if (w.hold > 0) { w.hold--; return; }
    if (w.shown < w.target.length) {
      const backlog = w.target.length - w.shown;
      w.shown = Math.min(w.target.length, w.shown + (w.fast ? 40 : backlog > 240 ? 4 : backlog > 90 ? 2 : 1));
      w.box.textContent = w.target.slice(0, w.shown);
      w.box.append(h('span', { className: 'cursor' }));
      if (/[.!?…]/.test(w.target[w.shown - 1] ?? '') && w.target[w.shown] === ' ') w.hold = 6;
      else if (/[,;:]/.test(w.target[w.shown - 1] ?? '')) w.hold = 2;
      scroll();
    }
    if (w.finished && w.shown >= w.target.length) {
      // c'est écrit : la bulle est refaite en entier (heure, copier, sites consultés)
      const msg: ChatMessage = { role: 'gilbert', text: w.full, at: Date.now() };
      current.messages.push(msg);
      w.box.closest('.msg')?.replaceWith(bubble(msg));
      stopTyping();
      labels();
      scroll();
      input.focus();
    }
  };
  const startTicker = () => { ticker ??= setInterval(tick, 24); };

  chat.onEvent((ev) => {
    const w = typing;
    if (!current || ev.chat !== current.id || !w) return;
    w.box.parentElement?.parentElement?.classList.remove('waiting');
    if (ev.kind === 'chunk') {
      if (!w.target) w.box.replaceChildren();
      w.target += ev.text;
      startTicker();
    } else if (ev.kind === 'done') {
      if (!w.target) w.box.replaceChildren();
      w.full = ev.text;
      w.target = split(ev.text).body;
      w.finished = true;
      startTicker();
    } else {
      w.box.textContent = `${t().error}${ev.text}`;
      stopTyping();
      labels();
      scroll();
    }
  });

  input.addEventListener('input', grow);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    } else if (e.key === 'Escape' && typing && current) {
      // Échap : ce qui est déjà trouvé arrive d'un coup, et ça s'arrête là
      e.stopPropagation();
      typing.fast = true;
      chat.cancel(current.id);
    }
  });
  newBtn.addEventListener('click', () => fresh());

  el.classList.add('chatbox');
  el.replaceChildren(
    h('aside', { className: 'chat-side' }, newBtn, list, h('div', { className: 'chat-gilbert' })),
    h('section', { className: 'chat-main' }, msgs, h('div', { className: 'chat-compose' }, input)),
  );
  labels();
  drawThread();

  /** La recherche rapide (⌘K) ouvre une discussion, ou en commence une neuve */
  window.addEventListener('gilbert:chat', (e) => {
    const id = (e as CustomEvent<string>).detail;
    if (id === 'new') void fresh();
    else chat.list().then((l) => { threads = l; return select(id); }).catch(() => {});
  });

  /** À l'ouverture de l'onglet : la dernière discussion, ou une neuve */
  return async () => {
    threads = await chat.list();
    if (current) { drawList(); return; }
    const last = threads.find((s) => s.count > 0) ?? threads[0];
    if (last) await select(last.id); else await fresh();
  };
}
