// Le carnet de Gilbert : tout ce qu'il sait de toi, modifiable. Chaque changement est
// enregistré tout seul après une courte pause. C'est un onglet de la fenêtre des réglages.

import { EMPTY_MEMORY, type CarnetApi, type Lang, type Memory, type Profile } from '../shared/types';

declare global {
  interface Window { carnet?: CarnetApi }
}

const T = {
  fr: {
    intro: "Tout ce que je sais de toi. Corrige, complète ou efface : c'est enregistré automatiquement, et ça ne quitte pas ton ordinateur.",
    you: 'Les classiques',
    more: 'Pour mieux te connaître',
    moreHint: 'Rien d’obligatoire. Ce que tu écris ici, je m’en sers avec parcimonie : pour te remotiver, te taquiner juste ce qu’il faut, fêter ce qui compte.',
    fields: {
      name: ['Prénom', ''], nickname: ['Comment je t’appelle', 'un surnom, ou rien'], city: ['Ta ville', 'pour la météo du matin'],
      job: ['Ce que tu fais', 'designer, étudiant, boulanger…'], schedule: ['Tes horaires', 'de 9 h à 18 h, plutôt du soir…'], birthday: ['Ton anniversaire', 'JJ/MM'],
      fuel: ['Ton carburant', 'café serré, thé, chocolat…'], goal: ['L’objectif du moment', 'finir le site, courir 10 km…'], humor: ['Ce qui te fait rire', 'l’absurde, les jeux de mots…'],
      procrastination: ['Ta pire procrastination', 'YouTube, ranger son bureau…'], motivation: ['La phrase qui te remotive', 'quand ça ne va pas'], avoid: ['Sujets interdits', 'je ne te chambre jamais là-dessus'],
    },
    people: 'Tes proches',
    noPeople: 'Personne pour le moment.',
    personName: 'Prénom', relation: 'Lien', birthday: 'Anniv. JJ/MM',
    addPerson: '+ Ajouter un proche',
    facts: "Ce que j'ai retenu",
    noFacts: "Rien encore. Discute avec moi, j'apprendrai.",
    addFact: '+ Ajouter un souvenir',
    sources: { onboarding: 'quand on a fait connaissance', conversation: 'en discutant', carnet: 'ajouté ici' },
    forget: 'Tout oublier',
    forgetConfirm: "Gilbert va tout oublier de toi (profil, proches, souvenirs). C'est définitif. On y va ?",
    saved: 'Enregistré',
    remove: 'Retirer',
  },
  en: {
    intro: "Everything I know about you. Fix, add or erase: it saves automatically, and never leaves your computer.",
    you: 'The basics',
    more: 'Getting to know you',
    moreHint: 'All optional. I use what you write here sparingly: to cheer you up, tease you just enough, celebrate what matters.',
    fields: {
      name: ['Name', ''], nickname: ['What I call you', 'a nickname, or nothing'], city: ['Your city', 'for the morning weather'],
      job: ['What you do', 'designer, student, baker…'], schedule: ['Your hours', '9 to 6, more of a night owl…'], birthday: ['Your birthday', 'DD/MM'],
      fuel: ['Your fuel', 'espresso, tea, chocolate…'], goal: ['Current goal', 'ship the site, run 10 km…'], humor: ['What makes you laugh', 'absurd stuff, puns…'],
      procrastination: ['Your worst procrastination', 'YouTube, tidying the desk…'], motivation: ['The line that gets you going', 'for the bad days'], avoid: ['Off-limits topics', 'I never tease you about these'],
    },
    people: 'Your close ones',
    noPeople: 'Nobody yet.',
    personName: 'Name', relation: 'Relationship', birthday: 'Birthday DD/MM',
    addPerson: '+ Add someone',
    facts: "What I've learned",
    noFacts: "Nothing yet. Chat with me, I'll learn.",
    addFact: '+ Add a memory',
    sources: { onboarding: 'when we got to know each other', conversation: 'while chatting', carnet: 'added here' },
    forget: 'Forget everything',
    forgetConfirm: 'Gilbert will forget everything about you (profile, close ones, memories). This cannot be undone. Go ahead?',
    saved: 'Saved',
    remove: 'Remove',
  },
  vi: {
    intro: 'Mọi điều tớ biết về cậu. Sửa, thêm hay xóa: tự động lưu, và không bao giờ rời khỏi máy của cậu.',
    you: 'Cơ bản',
    more: 'Để tớ hiểu cậu hơn',
    moreHint: 'Không bắt buộc. Tớ dùng những điều này có chừng mực: để cổ vũ cậu, trêu vừa đủ, và mừng những ngày quan trọng.',
    fields: {
      name: ['Tên', ''], nickname: ['Tớ gọi cậu là gì', 'biệt danh, hoặc để trống'], city: ['Thành phố', 'để báo thời tiết buổi sáng'],
      job: ['Cậu làm gì', 'thiết kế, sinh viên, thợ bánh…'], schedule: ['Giờ giấc', '9 giờ đến 6 giờ, cú đêm…'], birthday: ['Sinh nhật cậu', 'NN/TT'],
      fuel: ['Nhiên liệu của cậu', 'cà phê, trà, sô-cô-la…'], goal: ['Mục tiêu hiện tại', 'làm xong web, chạy 10 km…'], humor: ['Điều làm cậu cười', 'chuyện vô lý, chơi chữ…'],
      procrastination: ['Kiểu trì hoãn tệ nhất', 'YouTube, dọn bàn…'], motivation: ['Câu nói tiếp thêm động lực', 'cho những ngày tệ'], avoid: ['Chủ đề cấm', 'tớ không bao giờ trêu cậu về chúng'],
    },
    people: 'Người thân của cậu',
    noPeople: 'Chưa có ai.',
    personName: 'Tên', relation: 'Quan hệ', birthday: 'Sinh nhật NN/TT',
    addPerson: '+ Thêm người thân',
    facts: 'Những điều tớ đã nhớ',
    noFacts: 'Chưa có gì. Trò chuyện với tớ đi, tớ sẽ học.',
    addFact: '+ Thêm kỷ niệm',
    sources: { onboarding: 'khi mới làm quen', conversation: 'khi trò chuyện', carnet: 'thêm ở đây' },
    forget: 'Quên hết',
    forgetConfirm: 'Gilbert sẽ quên hết về cậu (hồ sơ, người thân, kỷ niệm). Không thể hoàn tác. Tiếp tục chứ?',
    saved: 'Đã lưu',
    remove: 'Xóa',
  },
};

// aperçu navigateur : un carnet factice
const api: CarnetApi = window.carnet ?? {
  get: async () => ({ memory: { ...structuredClone(EMPTY_MEMORY), profile: { ...EMPTY_MEMORY.profile, name: 'Jules' } }, lang: 'fr' as Lang }),
  save: () => {},
  forgetAll: () => {},
  onChange: () => {},
};

let memory: Memory;
let t = T.fr;
let app: HTMLElement;

function h<E extends HTMLElement = HTMLElement>(tag: string, props: Record<string, unknown> = {}, ...children: (Node | string)[]): E {
  const el = Object.assign(document.createElement(tag), props) as E;
  el.append(...children);
  return el;
}

let saveTimer: number | null = null;
let status: HTMLElement;
function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    api.save(memory);
    status.textContent = t.saved;
    setTimeout(() => { status.textContent = ''; }, 1500);
  }, 400);
}

function input(value: string, onInput: (v: string) => void, placeholder = '', type = 'text') {
  const el = h<HTMLInputElement>('input', { value, placeholder, type });
  el.addEventListener('input', () => { onInput(el.value); save(); });
  return el;
}

function render() {
  const sections: HTMLElement[] = [];

  // qui tu es : les classiques, puis de quoi mieux te connaître
  const field = (key: keyof Profile) => {
    const [label, hint] = t.fields[key];
    return h('label', { className: 'field' }, h('span', {}, label), input(memory.profile[key] ?? '', (v) => { memory.profile[key] = v; }, hint));
  };
  const BASICS: (keyof Profile)[] = ['name', 'nickname', 'city', 'job', 'schedule', 'birthday'];
  const MORE: (keyof Profile)[] = ['fuel', 'goal', 'humor', 'procrastination', 'motivation', 'avoid'];
  sections.push(h('section', {}, h('h2', {}, t.you), h('div', { className: 'pair' }, ...BASICS.map(field))));
  sections.push(h('section', {}, h('h2', {}, t.more), h('p', { className: 'empty' }, t.moreHint), h('div', { className: 'pair' }, ...MORE.map(field))));

  // proches
  const people = h('section', {}, h('h2', {}, t.people));
  if (!memory.people.length) people.append(h('p', { className: 'empty' }, t.noPeople));
  memory.people.forEach((p, i) => {
    const remove = h('button', { className: 'remove', title: t.remove, textContent: '×' });
    remove.addEventListener('click', () => { memory.people.splice(i, 1); save(); render(); });
    people.append(h('div', { className: 'row person' },
      input(p.name, (v) => { p.name = v; }, t.personName),
      input(p.relation, (v) => { p.relation = v; }, t.relation),
      input(p.birthday, (v) => { p.birthday = v; }, t.birthday),
      remove));
  });
  const addPerson = h('button', { className: 'ghost', textContent: t.addPerson });
  addPerson.addEventListener('click', () => {
    memory.people.push({ id: '', name: '', relation: '', birthday: '' });
    render();
    (app.querySelector('.row.person:last-of-type input') as HTMLInputElement | null)?.focus();
  });
  people.append(addPerson);
  sections.push(people);

  // souvenirs
  const facts = h('section', {}, h('h2', {}, t.facts));
  if (!memory.facts.length) facts.append(h('p', { className: 'empty' }, t.noFacts));
  memory.facts.forEach((f, i) => {
    const text = h<HTMLTextAreaElement>('textarea', { value: f.text, rows: 1 });
    text.addEventListener('input', () => { f.text = text.value; save(); });
    const remove = h('button', { className: 'remove', title: t.remove, textContent: '×' });
    remove.addEventListener('click', () => { memory.facts.splice(i, 1); save(); render(); });
    facts.append(h('div', { className: 'row fact' }, text, remove), h('div', { className: 'source' }, t.sources[f.source]));
  });
  const addFact = h('button', { className: 'ghost', textContent: t.addFact });
  addFact.addEventListener('click', () => {
    memory.facts.push({ id: '', text: '', source: 'carnet', createdAt: Date.now() });
    render();
    (app.querySelector('.row.fact:last-of-type textarea') as HTMLTextAreaElement | null)?.focus();
  });
  facts.append(addFact);
  sections.push(facts);

  // pied de page
  const forget = h('button', { className: 'danger', textContent: t.forget });
  forget.addEventListener('click', () => {
    if (confirm(t.forgetConfirm)) api.forgetAll();
  });
  status = h('span');

  app.replaceChildren(
    h('p', { className: 'intro' }, t.intro),
    ...sections,
    h('div', { className: 'footer' }, status, forget),
  );
}

/** Affiche le carnet dans `root` et le tient à jour */
export function mountCarnet(root: HTMLElement) {
  app = root;
  api.get().then(({ memory: m, lang }) => {
    memory = m;
    t = T[lang] ?? T.fr;
    render();
  });

  // Gilbert a appris quelque chose pendant que le carnet est ouvert : on rafraîchit,
  // sauf si tu es en train d'écrire (on ne veut pas te couper)
  const typing = () => Boolean(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName) && app.contains(document.activeElement));
  // pendant que tu écris, on garde tes modifications mais on récupère ce qu'il vient d'apprendre :
  // sinon le prochain enregistrement du carnet effacerait ces souvenirs
  let stale = false;
  api.onChange((m) => {
    if (!memory) return;
    if (typing()) {
      const known = new Set(memory.facts.map((f) => f.id));
      memory.facts.push(...m.facts.filter((f) => !known.has(f.id)));
      stale = true;
      return;
    }
    memory = m;
    render();
  });
  app.addEventListener('focusout', () => setTimeout(() => {
    if (!stale || typing()) return;
    stale = false;
    render();
  }, 0));
}
