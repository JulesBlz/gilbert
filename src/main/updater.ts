// Les mises à jour : Gilbert regarde si une version plus récente est publiée sur GitHub (releases du dépôt
// public), et propose de s'y mettre. Sécurité :
// - rien n'est installé sans ton accord (une bulle te le demande) ;
// - l'archive est signée (Ed25519) avec une clé privée qui n'existe que chez toi et dans les secrets de
//   GitHub Actions ; la clé publique est écrite ici. Un dépôt piraté ne suffit donc pas : sans la clé
//   privée, aucune fausse version ne passe la vérification ;
// - la signature couvre la version et l'empreinte SHA-256 : une ancienne version rejouée est refusée ;
// - seules les adresses github.com du dépôt sont suivies, la taille est plafonnée, rien n'est exécuté
//   avant la vérification, et l'appli extraite doit porter le bon identifiant et la bonne version.
// Mac seulement (Windows : l'installeur .exe reste à lancer à la main).

import { app } from 'electron';
import { execFileSync } from 'node:child_process';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { swapIntoDesktop } from './desktop';

const REPO = 'JulesBlz/gilbert';
/** La clé publique de signature (Ed25519, SPKI en base64) ; la privée n'est jamais dans le dépôt */
const PUBLIC_KEY = 'MCowBQYDK2VwAyEAREOwlMskLM1jdyj8HCyy70JU6VOQdGIyj4gTSctF7Lw=';
const MAX_BYTES = 2 * 1024 ** 3;
const HOSTS = ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'];

export interface Update { version: string; zip: string; sig: string }

const parts = (v: string) => v.split('.').map(Number);
export function isNewer(a: string, b: string) {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

/** Ce que Gilbert signe : la version et l'empreinte de l'archive */
export const signedMessage = (version: string, sha256: string) => Buffer.from(`gilbert-update:${version}:${sha256}`);

export function signatureValid(version: string, sha256: string, sigBase64: string, key = PUBLIC_KEY) {
  try {
    const pub = createPublicKey({ key: Buffer.from(key, 'base64'), format: 'der', type: 'spki' });
    return verify(null, signedMessage(version, sha256), pub, Buffer.from(sigBase64.trim(), 'base64'));
  } catch {
    return false;
  }
}

const trusted = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
};

/** La dernière release publiée, si elle est plus récente que cette appli */
export async function checkForUpdate(): Promise<Update | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Gilbert' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const rel = await res.json() as { tag_name?: string; draft?: boolean; prerelease?: boolean; assets?: { name: string; browser_download_url: string }[] };
  const version = String(rel.tag_name ?? '').replace(/^v/, '');
  if (rel.draft || rel.prerelease || !/^\d+\.\d+\.\d+$/.test(version) || !isNewer(version, app.getVersion())) return null;
  const find = (name: string) => rel.assets?.find((a) => a.name === name)?.browser_download_url ?? '';
  const zip = find(`Gilbert-${version}-arm64.zip`), sig = find(`Gilbert-${version}-arm64.zip.sig`);
  if (!trusted(zip) || !trusted(sig) || !zip.startsWith(`https://github.com/${REPO}/releases/download/`)) return null;
  return { version, zip, sig };
}

async function get(url: string, timeout: number) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Gilbert' }, signal: AbortSignal.timeout(timeout), redirect: 'follow' });
  if (!res.ok || !res.body || !trusted(res.url)) throw new Error(`téléchargement refusé (${res.status})`);
  return res;
}

/** Télécharge l'archive, vérifie sa signature ; renvoie son chemin (jamais avant que la signature soit bonne) */
export async function download(u: Update, progress: (pct: number) => void) {
  const dir = mkdtempSync(path.join(app.getPath('temp'), 'gilbert-update-'));
  try {
    const sig = await (await get(u.sig, 20_000)).text();
    const res = await get(u.zip, 30 * 60_000);
    const total = Number(res.headers.get('content-length') ?? 0);
    if (total > MAX_BYTES) throw new Error('archive trop grosse');
    const file = path.join(dir, 'Gilbert.zip');
    const hash = createHash('sha256');
    let got = 0, last = -1;
    const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream<Uint8Array>);
    body.on('data', (chunk: Buffer) => {
      got += chunk.length;
      if (got > MAX_BYTES) body.destroy(new Error('archive trop grosse'));
      hash.update(chunk);
      const pct = total ? Math.floor((got / total) * 100) : 0;
      if (pct !== last) { last = pct; progress(pct); }
    });
    await pipeline(body, createWriteStream(file));
    if (!signatureValid(u.version, hash.digest('hex'), sig)) throw new Error('signature invalide : mise à jour refusée');
    return { file, dir };
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}

/** Extrait l'archive vérifiée, contrôle l'appli, la met en place sur le bureau et passe la main à la nouvelle */
export function install(u: Update, zip: { file: string; dir: string }) {
  const out = path.join(zip.dir, 'app');
  mkdirSync(out);
  execFileSync('ditto', ['-x', '-k', zip.file, out], { timeout: 300_000 });
  const fresh = path.join(out, 'Gilbert.app');
  const plist = (key: string) => execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, path.join(fresh, 'Contents', 'Info.plist')], { timeout: 10_000 }).toString().trim();
  if (!existsSync(fresh) || plist('CFBundleIdentifier') !== 'app.gilbert.desktop' || plist('CFBundleShortVersionString') !== u.version) throw new Error('appli inattendue : mise à jour refusée');
  swapIntoDesktop(fresh);
  rmSync(zip.dir, { recursive: true, force: true });
}
