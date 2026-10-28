// Secrets (mot de passe d'application du mail) : chiffrés avec la clé du trousseau du système
// (Trousseau macOS, DPAPI sous Windows) via safeStorage, puis rangés dans secrets.json.

import { app, safeStorage } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const file = () => path.join(app.getPath('userData'), 'secrets.json');

function load(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(file(), 'utf8'));
  } catch {
    return {};
  }
}

export function getSecret(key: string): string {
  const b64 = load()[key];
  if (!b64 || !safeStorage.isEncryptionAvailable()) return '';
  try {
    return safeStorage.decryptString(Buffer.from(b64, 'base64'));
  } catch {
    return '';
  }
}

export function setSecret(key: string, value: string) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('le chiffrement du système est indisponible');
  const all = load();
  if (value) all[key] = safeStorage.encryptString(value).toString('base64');
  else delete all[key];
  mkdirSync(path.dirname(file()), { recursive: true });
  writeFileSync(file(), JSON.stringify(all), { mode: 0o600 });
}
