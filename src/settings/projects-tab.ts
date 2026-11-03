// L'onglet Projets : une fiche de suivi par projet important. À gauche la liste, rangée par catégorie ; à
// droite la fiche : prochaine étape, ce que Gilbert recommande (répondre, relancer, préparer), les notes
// qu'il prend (mails, rendez-vous) et que tu peux compléter, et ce qui tourne autour (agenda, liste, mails).

import type { Lang, Project, ProjectOp, ProjectsApi, ProjectStatus, ProjectView } from '../shared/types';
import { tiny } from './icons';
import { saved } from './saved';

declare global {
  interface Window { projects?: ProjectsApi }
}

const T = {
  fr: {
    add: 'Nouveau projet', create: 'Créer', cancel: 'Annuler', newTitle: 'Nouveau projet',
    namePh: 'Nom du projet', none: 'Aucun projet pour l’instant.', first: 'Créer mon premier projet',
    noneHint: 'Crée la fiche d’un projet important : je range dedans les mails et échéances qui le concernent, je te rappelle ce qu’il ne faut pas oublier et j’écris où on en est.',
    uncategorized: 'Sans catégorie', finished: 'Terminés',
    name: 'Nom', category: 'Catégorie', categoryPh: 'Travail, Perso, Client…',
    statuses: { active: 'En cours', paused: 'En attente', done: 'Terminé' } as Record<ProjectStatus, string>,
    keywords: 'Mots à reconnaître', keywordsPh: 'noms, adresses mail… (virgules)',
    keywordsHint: 'Les mails, rendez-vous et fenêtres qui contiennent un de ces mots, ou le nom du projet, sont rangés ici.',
    description: 'Description', descriptionPh: 'De quoi s’agit-il, en une phrase',
    todo: 'À faire', todoAdd: 'Ajouter…', todoEmpty: 'Rien à faire : je note ici ce que je repère dans tes mails et sur ton écran.', byGilbert: 'Gilbert', date: 'Date', noDate: '+ date', draft: 'Brouillon', dismiss: 'Écarter',
    doneN: (n: number) => `${n} fait${n > 1 ? 's' : ''}`, of: (d: number, n: number) => `${d} sur ${n}`,
    report: 'Où j’en suis', feed: 'Dernières infos', feedNone: 'Rien de relevé pour l’instant : ça se remplit tout seul.', sources: { mail: 'mail', screen: 'écran', chat: 'discussion', manual: 'toi' } as Record<string, string>, reportPh: 'Je rédige ici le rapport d’avancement, au fil de tes mails.', byMe: 'écrit par Gilbert', byYou: 'écrit par toi', refresh: 'Mettre à jour',
    settings: 'Réglages du projet', sure: 'Sûr ?', remove: 'Supprimer le projet', removeConfirm: (n: string) => `Supprimer la fiche « ${n} » et tout son contenu ?`, del: 'Retirer',
    today: 'aujourd’hui', tomorrow: 'demain',
  },
  en: {
    add: 'New project', create: 'Create', cancel: 'Cancel', newTitle: 'New project',
    namePh: 'Project name', none: 'No project yet.', first: 'Create my first project',
    noneHint: 'Create a sheet for an important project: I file the emails and deadlines about it, remind you of what not to forget and write where things stand.',
    uncategorized: 'No category', finished: 'Done',
    name: 'Name', category: 'Category', categoryPh: 'Work, Personal, Client…',
    statuses: { active: 'Active', paused: 'On hold', done: 'Done' } as Record<ProjectStatus, string>,
    keywords: 'Words to recognise', keywordsPh: 'names, emails… (commas)',
    keywordsHint: 'Emails, meetings and windows containing one of these words, or the project name, are filed here.',
    description: 'Description', descriptionPh: 'What is it about, in one sentence',
    todo: 'To do', todoAdd: 'Add…', todoEmpty: 'Nothing to do: I note here what I spot in your emails and on your screen.', byGilbert: 'Gilbert', date: 'Date', noDate: '+ date', draft: 'Draft', dismiss: 'Dismiss',
    doneN: (n: number) => `${n} done`, of: (d: number, n: number) => `${d} of ${n}`,
    report: 'Where I stand', feed: 'Latest info', feedNone: 'Nothing picked up yet: it fills itself.', sources: { mail: 'email', screen: 'screen', chat: 'chat', manual: 'you' } as Record<string, string>, reportPh: 'I write the progress report here, as your emails come in.', byMe: 'written by Gilbert', byYou: 'written by you', refresh: 'Update',
    settings: 'Project settings', sure: 'Sure?', remove: 'Delete project', removeConfirm: (n: string) => `Delete the "${n}" sheet and all its content?`, del: 'Remove',
    today: 'today', tomorrow: 'tomorrow',
  },
  vi: {
    add: 'Dự án mới', create: 'Tạo', cancel: 'Hủy', newTitle: 'Dự án mới',
    namePh: 'Tên dự án', none: 'Chưa có dự án nào.', first: 'Tạo dự án đầu tiên',
    noneHint: 'Tạo hồ sơ cho một dự án quan trọng: tớ gom email và hạn chót liên quan, nhắc điều không được quên và viết tiến độ.',
    uncategorized: 'Chưa phân loại', finished: 'Đã xong',
    name: 'Tên', category: 'Phân loại', categoryPh: 'Công việc, Cá nhân, Khách hàng…',
    statuses: { active: 'Đang làm', paused: 'Chờ', done: 'Xong' } as Record<ProjectStatus, string>,
    keywords: 'Từ để nhận ra', keywordsPh: 'tên, email… (dấu phẩy)',
    keywordsHint: 'Email, cuộc hẹn và cửa sổ có chứa một trong các từ này, hoặc tên dự án, sẽ được gom vào đây.',
    description: 'Mô tả', descriptionPh: 'Về cái gì, trong một câu',
    todo: 'Việc cần làm', todoAdd: 'Thêm…', todoEmpty: 'Chưa có việc: tớ ghi ở đây những gì thấy trong email và trên màn hình.', byGilbert: 'Gilbert', date: 'Ngày', noDate: '+ ngày', draft: 'Bản nháp', dismiss: 'Bỏ qua',
    doneN: (n: number) => `${n} xong`, of: (d: number, n: number) => `${d} trên ${n}`,
    report: 'Tiến độ hiện tại', feed: 'Thông tin mới', feedNone: 'Chưa ghi nhận gì: tự động điền.', sources: { mail: 'email', screen: 'màn hình', chat: 'trò chuyện', manual: 'cậu' } as Record<string, string>, reportPh: 'Tớ viết báo cáo tiến độ ở đây, theo các email của cậu.', byMe: 'do Gilbert viết', byYou: 'do cậu viết', refresh: 'Cập nhật',
    settings: 'Cài đặt dự án', sure: 'Chắc chưa?', remove: 'Xóa dự án', removeConfirm: (n: string) => `Xóa hồ sơ « ${n} » và toàn bộ nội dung?`, del: 'Gỡ',
    today: 'hôm nay', tomorrow: 'ngày mai',
  },
};

// aperçu navigateur : quelques projets factices
const demo: ProjectView[] = [{
  project: { id: 'a', name: 'Refonte du site', category: 'Client', status: 'active', keywords: ['Camille', 'camille@studio.fr'], description: 'Nouveau site vitrine pour le studio de Camille, livraison fin du mois.', progress: 'La maquette est validée par Camille. Il reste à envoyer le devis révisé avant jeudi ; la livraison est prévue le 28 novembre.', progressAuto: true,
    todos: [{ id: 't1', text: 'Envoyer le devis révisé', due: '2026-11-05', done: false, auto: true, at: 0 }, { id: 't2', text: 'Valider les textes', due: '', done: false, auto: false, at: 0 }, { id: 't3', text: 'Choisir la typo', due: '', done: true, auto: false, at: 0 }],
    notes: [{ id: '1', at: Date.now() - 86_400_000, text: 'Camille : valide la maquette, attend le devis (attend une réponse)', source: 'mail' }, { id: '2', at: Date.now() - 3 * 86_400_000, text: 'Livraison prévue le 28 nov., budget plafonné à 4 000 €', source: 'screen' }],
    doc: 'Idées : animations légères, pas de carrousel.', createdAt: Date.now() - 20 * 86_400_000, updatedAt: Date.now(), seenAt: 0 },
  percent: 33,
  advice: [{ id: 'reply:1', kind: 'reply', draft: true, text: 'Camille attend ta réponse depuis 3 j : valide la maquette, attend le devis' }],
  events: [{ when: 'jeu. 6 nov. 10:00', title: 'Point maquette' }], mails: [{ from: 'Camille', summary: 'valide la maquette, attend le devis', when: 'lun. 3 nov.' }],
}, {
  project: { id: 'b', name: 'Déménagement', category: 'Perso', status: 'active', keywords: [], description: '', progress: '', progressAuto: true, todos: [], notes: [], doc: '', createdAt: Date.now(), updatedAt: Date.now(), seenAt: 0 },
  percent: -1, advice: [], events: [], mails: [],
}];
const api: ProjectsApi = window.projects ?? {
  get: async () => ({ projects: demo, categories: ['Client', 'Perso'], lang: 'fr' as Lang }),
  act: () => {},
  onChange: () => {},
};

function h<E extends HTMLElement = HTMLElement>(tag: string, props: Record<string, unknown> = {}, ...children: (Node | string)[]): E {
  const el = Object.assign(document.createElement(tag), props) as E;
  el.append(...children);
  return el;
}

/** Les projets (nom et catégorie), pour la recherche rapide */
export async function listProjects() {
  return (await api.get()).projects.map((v) => ({ id: v.project.id, name: v.project.name, category: v.project.category }));
}

/** Affiche les projets dans `root` et les tient à jour */
export function mountProjects(root: HTMLElement) {
  let t = T.fr;
  let views: ProjectView[] = [];
  let categories: string[] = [];
  let selected = '';
  let creating = false;
  /** Après une création : ouvrir la nouvelle fiche dès qu'elle arrive */
  let openNewest = false;
  let stale = false;
  let currentLang: Lang = 'fr';
  const locale = () => ({ fr: 'fr-FR', en: 'en-GB', vi: 'vi-VN' })[currentLang];

  const act = (op: ProjectOp) => { api.act(op); if (op.type !== 'draft' && op.type !== 'report') saved(); };
  const typing = () => Boolean(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && root.contains(document.activeElement));

  const field = (label: string, input: HTMLElement, hint = '') => h('label', { className: 'field', title: hint }, h('span', {}, label), input);
  const text = (value: string, placeholder: string, commit: (v: string) => void, list = '') => {
    const el = h<HTMLInputElement>('input', { value, placeholder, type: 'text' });
    if (list) el.setAttribute('list', list);
    el.addEventListener('change', () => commit(el.value));
    return el;
  };
  const area = (value: string, placeholder: string, rows: number, commit: (v: string) => void, live = false) => {
    const el = h<HTMLTextAreaElement>('textarea', { value, placeholder, rows });
    el.addEventListener('change', () => commit(el.value));
    // le document s'enregistre pendant qu'on écrit
    if (live) {
      let timer = 0;
      el.addEventListener('input', () => { clearTimeout(timer); timer = window.setTimeout(() => commit(el.value), 700); });
    }
    return el;
  };
  const dataList = () => h('datalist', { id: 'pj-cats' }, ...categories.map((c) => h('option', { value: c })));

  function renderList() {
    const side = h('aside', { className: 'pj-side' });
    const add = h<HTMLButtonElement>('button', { className: 'chat-new', type: 'button' }, tiny('plus'), t.add);
    add.addEventListener('click', () => { creating = true; render(); });
    side.append(add);
    const groups = new Map<string, ProjectView[]>();
    for (const v of views.filter((x) => x.project.status !== 'done')) groups.set(v.project.category, [...(groups.get(v.project.category) ?? []), v]);
    // une ligne par projet : son nom, et la corbeille au survol (deux clics, comme pour les discussions)
    const item = (v: ProjectView) => {
      const p = v.project;
      const alerts = v.advice.length + p.todos.filter((x) => !x.done && x.due && x.due <= new Date().toLocaleDateString('sv')).length;
      const open = h<HTMLButtonElement>('button', { className: `pj-item${p.status === 'done' ? ' off' : ''}`, type: 'button' },
        h('span', { className: 'pj-name' }, p.name), ...(alerts ? [h('b', { className: 'pj-badge' }, String(alerts))] : []));
      open.addEventListener('click', () => { selected = p.id; creating = false; render(); });
      const del = h<HTMLButtonElement>('button', { className: 'conv-del', title: t.remove, type: 'button' }, tiny('trash'));
      del.addEventListener('click', () => {
        if (!del.classList.contains('sure')) {
          del.classList.add('sure');
          del.replaceChildren(t.sure);
          setTimeout(() => { if (del.isConnected && del.classList.contains('sure')) { del.classList.remove('sure'); del.replaceChildren(tiny('trash')); } }, 3000);
          return;
        }
        if (selected === p.id) selected = '';
        act({ type: 'remove', id: p.id });
      });
      return h('div', { className: `pj-row${!creating && p.id === selected ? ' on' : ''}` }, open, del);
    };
    for (const [cat, list] of [...groups].sort((a, b) => (a[0] === '' ? 1 : 0) - (b[0] === '' ? 1 : 0) || a[0].localeCompare(b[0]))) {
      side.append(h('div', { className: 'pj-cat' }, cat || t.uncategorized), ...list.map(item));
    }
    const finished = views.filter((x) => x.project.status === 'done');
    if (finished.length) side.append(h('details', { className: 'pj-fold pj-finished', open: finished.some((x) => x.project.id === selected) }, h('summary', {}, `${t.finished} (${finished.length})`), ...finished.map(item)));
    return side;
  }

  /** La création : quatre champs, rien de plus */
  function renderCreate() {
    const name = h<HTMLInputElement>('input', { placeholder: t.namePh });
    const category = text('', t.categoryPh, () => {}, 'pj-cats');
    const keywords = h<HTMLInputElement>('input', { placeholder: t.keywordsPh });
    const description = h<HTMLTextAreaElement>('textarea', { placeholder: t.descriptionPh, rows: 2 });
    const go = h<HTMLButtonElement>('button', { className: 'primary', textContent: t.create, type: 'button' });
    const submit = () => {
      if (!name.value.trim()) { name.focus(); return; }
      openNewest = true;
      creating = false;
      act({ type: 'add', name: name.value, category: category.value, keywords: keywords.value, description: description.value });
    };
    go.addEventListener('click', submit);
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    const cancel = h<HTMLButtonElement>('button', { className: 'ghost', textContent: t.cancel, type: 'button' });
    cancel.addEventListener('click', () => { creating = false; render(); });
    setTimeout(() => name.focus(), 0);
    return h('div', { className: 'pj-sheet' }, h('section', {}, h('h2', {}, t.newTitle),
      field(t.name, name), h('div', { className: 'pair' }, field(t.category, category), field(t.keywords, keywords, t.keywordsHint)),
      field(t.description, description), dataList(), h('div', { className: 'pj-actions' }, go, cancel)));
  }

  /** « jeu. 5 nov. », « demain »… et si la date est passée */
  const dueText = (due: string) => {
    const today = new Date().toLocaleDateString('sv'), tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('sv');
    if (due === today) return t.today;
    if (due === tomorrow) return t.tomorrow;
    return new Date(`${due}T12:00`).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' });
  };

  /** Une date discrète : un petit texte qu'on clique pour choisir (le sélecteur natif reste caché) */
  function datePill(value: string, change: (v: string) => void) {
    const today = new Date().toLocaleDateString('sv');
    const input = h<HTMLInputElement>('input', { type: 'date', value, tabIndex: -1 });
    const pill = h<HTMLButtonElement>('button', { type: 'button', className: `pj-pill${value ? '' : ' empty'}${value && value < today ? ' late' : value && value === today ? ' now' : ''}`, textContent: value ? dueText(value) : t.noDate, title: t.date });
    pill.addEventListener('click', () => { try { input.showPicker(); } catch { input.focus(); input.click(); } });
    input.addEventListener('change', () => change(input.value));
    return h('span', { className: 'pj-date' }, pill, input);
  }

  /** La page d'un projet : un titre, puis « Où j'en suis » (le plus important), « À faire », et deux volets repliés */
  function renderSheet(v: ProjectView) {
    const p = v.project;
    const edit = (patch: Extract<ProjectOp, { type: 'edit' }>['patch']) => act({ type: 'edit', id: p.id, patch });
    const sheet = h('div', { className: 'pj-sheet pj-doc' });

    // l'en-tête : le titre, une ligne de contexte, la description
    const title = text(p.name, t.namePh, (name) => edit({ name }));
    title.className = 'pj-title';
    const about = area(p.description, t.descriptionPh, 1, (description) => edit({ description }));
    about.className = 'pj-about';
    sheet.append(title, h('div', { className: 'pj-sub' }, [p.category || t.uncategorized, t.statuses[p.status]].join('  ·  ')), about);

    // 1. où j'en suis : la jauge et le rapport que Gilbert écrit
    const pct = p.status === 'done' ? 100 : v.percent;
    const hero = h('section', { className: 'pj-hero' }, h('h2', {}, t.report));
    if (pct >= 0) {
      const bar = h('i');
      bar.style.width = `${pct}%`;
      hero.append(h('div', { className: 'pj-gauge' }, h('span', { className: 'track' }, bar), h('b', {}, `${pct} %`), h('small', {}, t.of(p.todos.filter((x) => x.done).length, p.todos.length))));
    }
    const report = area(p.progress, t.reportPh, 3, (progress) => edit({ progress }));
    report.className = 'pj-report';
    const refresh = h<HTMLButtonElement>('button', { className: 'ghost', textContent: t.refresh, type: 'button' });
    refresh.addEventListener('click', () => act({ type: 'report', id: p.id }));
    hero.append(report, h('div', { className: 'pj-by' }, h('small', {}, p.progress ? (p.progressAuto ? t.byMe : t.byYou) : ''), refresh));
    sheet.append(hero);

    // 2. à faire : ses recommandations d'abord, puis les cases triées par échéance
    const open = p.todos.filter((x) => !x.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const todo = h('section', {}, h('h2', {}, t.todo, ...(open.length + v.advice.length ? [h('small', { className: 'count' }, String(open.length + v.advice.length))] : [])));
    for (const a of v.advice) {
      const row = h('div', { className: 'pj-line advice' }, h('span', { className: 'pj-mark' }), h('span', { className: 'pj-text' }, a.text));
      if (a.draft) {
        const d = h<HTMLButtonElement>('button', { className: 'ghost', textContent: t.draft, type: 'button' });
        d.addEventListener('click', () => act({ type: 'draft', id: p.id, adviceId: a.id }));
        row.append(d);
      }
      const x = h<HTMLButtonElement>('button', { className: 'conv-del pj-del', title: t.dismiss, type: 'button' }, tiny('close'));
      x.addEventListener('click', () => act({ type: 'dismiss', id: p.id, adviceId: a.id }));
      row.append(x);
      todo.append(row);
    }
    const todoRow = (td: Project['todos'][number]) => {
      const box = h<HTMLInputElement>('input', { type: 'checkbox', checked: td.done, className: 'pj-check' });
      box.addEventListener('change', () => act({ type: 'todoEdit', id: p.id, todoId: td.id, patch: { done: box.checked } }));
      const label = text(td.text, '', (v2) => act({ type: 'todoEdit', id: p.id, todoId: td.id, patch: { text: v2 } }));
      label.className = 'pj-todo-text';
      const del = h<HTMLButtonElement>('button', { className: 'conv-del pj-del', title: t.del, type: 'button' }, tiny('close'));
      del.addEventListener('click', () => act({ type: 'todoRemove', id: p.id, todoId: td.id }));
      return h('div', { className: `pj-line${td.done ? ' done' : ''}` }, box, label, ...(td.auto && !td.done ? [h('small', { className: 'pj-src' }, t.byGilbert)] : []),
        datePill(td.due, (due) => act({ type: 'todoEdit', id: p.id, todoId: td.id, patch: { due } })), del);
    };
    for (const td of open) todo.append(todoRow(td));
    if (!open.length && !v.advice.length) todo.append(h('p', { className: 'empty' }, t.todoEmpty));
    const newText = h<HTMLInputElement>('input', { placeholder: `+ ${t.todoAdd}`, className: 'pj-todo-text pj-add' });
    newText.addEventListener('keydown', (e) => { if (e.key === 'Enter' && newText.value.trim()) { act({ type: 'todoAdd', id: p.id, text: newText.value, due: '' }); newText.value = ''; } });
    todo.append(h('div', { className: 'pj-line' }, h('span', { className: 'pj-mark' }), newText));
    const done = p.todos.filter((x) => x.done);
    if (done.length) todo.append(h('details', { className: 'pj-fold' }, h('summary', {}, t.doneN(done.length)), ...done.map(todoRow)));
    sheet.append(todo);

    // 3. ce que Gilbert a relevé (d'où vient le rapport), replié
    const feed = h('section', { className: 'fold' }, h('details', {}, h('summary', {}, `${t.feed} (${p.notes.length})`)));
    const feedBox = feed.querySelector('details')!;
    if (!p.notes.length) feedBox.append(h('p', { className: 'empty' }, t.feedNone));
    for (const n of p.notes.slice(0, 12)) {
      const del = h<HTMLButtonElement>('button', { className: 'conv-del pj-del', title: t.del, type: 'button' }, tiny('close'));
      del.addEventListener('click', () => act({ type: 'noteRemove', id: p.id, noteId: n.id }));
      feedBox.append(h('div', { className: 'pj-line' }, h('small', { className: 'pj-src' }, new Date(n.at).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })),
        h('span', { className: 'pj-text' }, n.text), h('small', { className: 'pj-src' }, t.sources[n.source] ?? n.source), del));
    }
    sheet.append(feed);

    // 4. les réglages, repliés
    const status = h('div', { className: 'seg' });
    (['active', 'paused', 'done'] as ProjectStatus[]).forEach((s) => {
      const b = h<HTMLButtonElement>('button', { className: `ghost${p.status === s ? ' on' : ''}`, textContent: t.statuses[s], type: 'button' });
      b.addEventListener('click', () => edit({ status: s }));
      status.append(b);
    });
    const rm = h<HTMLButtonElement>('button', { className: 'danger', textContent: t.remove, type: 'button' });
    rm.addEventListener('click', () => { if (confirm(t.removeConfirm(p.name))) { selected = ''; act({ type: 'remove', id: p.id }); } });
    sheet.append(h('section', { className: 'fold pj-settings' }, h('details', {}, h('summary', {}, t.settings),
      field(t.category, text(p.category, t.categoryPh, (category) => edit({ category }), 'pj-cats')), dataList(),
      field(t.keywords, text(p.keywords.join(', '), t.keywordsPh, (keywords) => edit({ keywords })), t.keywordsHint),
      status, h('div', { className: 'footer' }, h('span'), rm))));
    return sheet;
  }

  const first = () => {
    const b = h<HTMLButtonElement>('button', { className: 'primary', textContent: t.first, type: 'button' });
    b.addEventListener('click', () => { creating = true; render(); });
    return b;
  };

  function render() {
    stale = false;
    const v = views.find((x) => x.project.id === selected) ?? views[0];
    if (v) selected = v.project.id;
    const body = creating || !v
      ? (creating ? renderCreate() : h('div', { className: 'pj-sheet' }, h('section', {}, h('h2', {}, t.none), h('div', { className: 'empty-state' }, h('p', {}, t.noneHint), first()))) )
      : renderSheet(v);
    root.replaceChildren(h('div', { className: 'pj' }, renderList(), body));
  }

  async function refresh() {
    const d = await api.get();
    currentLang = d.lang;
    t = T[d.lang] ?? T.fr;
    const before = new Set(views.map((x) => x.project.id));
    views = d.projects;
    categories = d.categories;
    if (openNewest) {
      const fresh = views.find((x) => !before.has(x.project.id));
      if (fresh) { selected = fresh.project.id; openNewest = false; }
    }
    if (typing()) { stale = true; return; }
    render();
  }

  // la recherche rapide (⌘K) ouvre une fiche, ou le formulaire de création
  window.addEventListener('gilbert:project', (e) => {
    const id = (e as CustomEvent<string>).detail;
    if (id === 'new') creating = true; else { selected = id; creating = false; }
    render();
  });
  root.addEventListener('focusout', () => setTimeout(() => { if (stale && !typing()) render(); }, 0));
  api.onChange(() => { void refresh(); });
  void refresh();
}
