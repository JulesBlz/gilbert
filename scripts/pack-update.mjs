// Prépare l'archive de mise à jour (Mac) : release/Gilbert-<version>-arm64.zip, et sa signature .zip.sig.
// La clé privée (Ed25519, PEM) vient de la variable UPDATE_KEY (secret GitHub Actions) ou, en local, du
// fichier ~/.gilbert/update-signing-key.pem. Elle ne doit jamais entrer dans le dépôt.
// Ce qui est signé : « gilbert-update:<version>:<sha256 de l'archive> » (voir src/main/updater.ts).
import { execFileSync } from 'node:child_process';
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const app = 'release/mac-arm64/Gilbert.app';
const zip = `release/Gilbert-${version}-arm64.zip`;
const pem = process.env.UPDATE_KEY || readFileSync(join(homedir(), '.gilbert', 'update-signing-key.pem'), 'utf8');

rmSync(zip, { force: true });
execFileSync('ditto', ['-c', '-k', '--keepParent', app, zip], { stdio: 'inherit' });
const sha = createHash('sha256').update(readFileSync(zip)).digest('hex');
const sig = sign(null, Buffer.from(`gilbert-update:${version}:${sha}`), createPrivateKey(pem));
writeFileSync(`${zip}.sig`, sig.toString('base64'));
console.log(`${zip}  sha256 ${sha}\nsignature → ${zip}.sig`);
