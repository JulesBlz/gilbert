// La recherche sur internet : la seule fonction de Gilbert qui sort de l'ordinateur. Elle ne part que
// pour une question dont la réponse n'est pas dans sa tête (actualité, faits récents, un lieu, une
// personne…) ou quand on le demande (« cherche… »), et seulement si le réglage est allumé. Le moteur
// est DuckDuckGo (sans compte), avec Wikipédia en secours. Seule la question est envoyée.

import type { Lang } from '../shared/types';

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

const text = (html: string) => html
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

/** Le site d'une adresse, pour le citer : https://www.lemonde.fr/x → lemonde.fr */
export const siteOf = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
};

async function duckduckgo(query: string, max: number, signal: AbortSignal): Promise<WebResult[]> {
  const res = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: new URLSearchParams({ q: query }).toString(),
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const out: WebResult[] = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  for (let m = re.exec(html); m && out.length < max; m = re.exec(html)) {
    let url = m[1].startsWith('//') ? `https:${m[1]}` : m[1];
    const real = new URL(url).searchParams.get('uddg');
    if (real) url = decodeURIComponent(real);
    if (/duckduckgo\.com\/y\.js/.test(url)) continue; // les publicités
    out.push({ title: text(m[2]), url, snippet: text(m[3]) });
  }
  return out;
}

async function wikipedia(query: string, lang: Lang, max: number, signal: AbortSignal): Promise<WebResult[]> {
  const api = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=${max}&srsearch=${encodeURIComponent(query)}`;
  const res = await fetch(api, { headers: { 'User-Agent': UA }, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as { query?: { search?: { title: string; snippet: string }[] } };
  return (json.query?.search ?? []).map((r) => ({
    title: r.title, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`, snippet: text(r.snippet),
  }));
}

/** Cherche sur internet : jusqu'à `max` résultats (titre, adresse, extrait), ou une liste vide */
export async function webSearch(query: string, lang: Lang, max = 5): Promise<WebResult[]> {
  const signal = AbortSignal.timeout(9000);
  const q = query.trim().slice(0, 200);
  if (!q) return [];
  const found = await duckduckgo(q, max, signal).catch(() => []);
  if (found.length) return found;
  return wikipedia(q, lang, 3, AbortSignal.timeout(6000)).catch(() => []);
}

/** « cherche sur internet… », « search for… » : la demande explicite, avec ce qu'il faut chercher */
const EXPLICIT = /^\s*(?:gilbert[\s,:]*)?(?:peux[- ]tu |pourrais[- ]tu |tu peux )?(?:(?:va )?(?:cherche|recherche|googl(?:e|ise)|trouve)(?:[- ]moi)?(?: (?:sur )?(?:internet|le web|google|en ligne|sur le net))?|search(?: the web| online)?(?: for)?|look up|google|tìm(?: kiếm)?(?: trên mạng)?)\s*(?:[:,]|que|qui|ce que|des infos (?:sur|à propos de)|infos sur|sur|pour|:)?\s+(.{3,})$/i;
export const explicitSearch = (message: string) => EXPLICIT.exec(message)?.[1]?.replace(/[?!.]+$/, '').trim() ?? null;

/** Une question de faits, qui pourrait avoir besoin du web (sinon, on ne dérange pas le modèle pour ça) */
/** Ce qui concerne ses propres affaires (agenda, mails, tâches) : la réponse n'est pas sur internet */
const PERSONAL = /\b(?:mon|ma|mes|my)\b[^?]*\b(?:agenda|calendrier|rendez-vous|rdv|mails?|e-?mails?|messages?|tâches?|liste|rappels?|réunions?|calendar|appointments?|tasks?|meetings?|reminders?|inbox)\b/i;

export const looksLikeLookup = (message: string) => {
  const t = message.trim();
  if (t.length < 12 || t.length > 240 || PERSONAL.test(t)) return false;
  return /\?\s*$/.test(t) || /^(?:dis[- ]moi|explique|c['’]est quoi|quel|quelle|quels|quelles|qui|combien|quand|où|ou est|comment|pourquoi|what|who|when|where|how|why|which|how much|là gì|ai|khi nào|ở đâu)\b/i.test(t);
};

/** Faut-il chercher sur internet pour répondre à ça ? La requête à taper, ou null */
export async function webQuery(b: { extract<T>(task: string, schema: object): Promise<T | null> }, question: string) {
  const r = await b.extract<{ chercher: boolean; requete: string }>([
    'Ton humain te pose une question. Réponds seulement en JSON.',
    '« chercher » : true si la réponse dépend de faits récents ou précis que tu peux ignorer (actualité, scores, prix, météo d’un autre lieu, horaires, sorties, une personne ou une entreprise précise, une date récente) ; false pour une conversation, un conseil, une opinion, une explication générale, un calcul, une blague, ou ce qui concerne ses propres affaires (mails, tâches, agenda, souvenirs).',
    '« requete » : 2 à 6 mots-clés pour un moteur de recherche (vide si chercher est false).',
    'Exemple : « Qui a gagné le match hier soir ? » → {"chercher":true,"requete":"résultat match hier soir"}',
    'Exemple : « Comment ça va ? » → {"chercher":false,"requete":""}',
    'Exemple : « Quand est mon prochain rendez-vous ? » → {"chercher":false,"requete":""}',
    'Exemple : « Explique-moi ce qu’est une dérivée » → {"chercher":false,"requete":""}',
    '',
    `Question : ${question}`,
  ].join('\n'), { type: 'object', properties: { chercher: { type: 'boolean' }, requete: { type: 'string' } }, required: ['chercher', 'requete'] });
  return r?.chercher && r.requete.trim() ? r.requete.trim() : null;
}

/** Les résultats de la recherche, mis devant la question pour que le cerveau s'y appuie */
export function webContext(results: WebResult[], question: string, lang: Lang) {
  const list = results.map((r, i) => `${i + 1}. ${r.title} (${siteOf(r.url)}) : ${r.snippet}`).join('\n');
  return lang === 'fr'
    ? `Résultats d'une recherche sur internet, faite à l'instant :\n${list}\n\nRéponds à sa question en 2 ou 3 phrases, en t'appuyant sur ces résultats (cite le site entre parenthèses). Si ça ne répond pas vraiment, dis-le sans inventer.\nSa question : ${question}`
    : lang === 'vi'
      ? `Kết quả tìm kiếm trên mạng vừa làm:\n${list}\n\nTrả lời câu hỏi trong 2-3 câu dựa trên các kết quả này (nêu tên trang trong ngoặc). Nếu chưa đủ, hãy nói thật, đừng bịa.\nCâu hỏi: ${question}`
      : `Web search results, just fetched:\n${list}\n\nAnswer their question in 2 or 3 sentences using these results (name the site in brackets). If they don't really answer it, say so without making things up.\nTheir question: ${question}`;
}
