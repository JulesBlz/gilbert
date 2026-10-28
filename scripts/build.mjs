// Compile le process principal, le preload et l'interface avec esbuild.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/renderer', { recursive: true });
mkdirSync('dist/settings', { recursive: true });
mkdirSync('dist/vision', { recursive: true });
// petits scripts système de la vision (lecture de l'écran), lancés tels quels
for (const f of readdirSync('src/main/vision')) if (/\.(js|ps1)$/.test(f)) copyFileSync(`src/main/vision/${f}`, `dist/vision/${f}`);

const common = { bundle: true, sourcemap: true, logLevel: 'warning' };

await Promise.all([
  build({
    ...common,
    entryPoints: ['src/main/main.ts'],
    outfile: 'dist/main.js',
    platform: 'node',
    format: 'cjs',
    // module natif (llama.cpp) et bibliothèques mail/agenda : chargés tels quels depuis node_modules
    external: ['electron', 'node-llama-cpp', 'imapflow', 'mailparser', 'ical.js', '@huggingface/transformers'],
  }),
  build({
    ...common,
    entryPoints: ['src/preload/preload.ts'],
    outfile: 'dist/preload.js',
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  }),
  build({
    ...common,
    entryPoints: ['src/preload/settings-preload.ts'],
    outfile: 'dist/settings-preload.js',
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  }),
  build({
    ...common,
    entryPoints: ['src/settings/settings.ts'],
    outfile: 'dist/settings/settings.js',
    platform: 'browser',
    format: 'iife',
    loader: { '.png': 'dataurl', '.woff2': 'file', '.woff': 'file' },
  }),
  build({
    ...common,
    entryPoints: ['src/renderer/renderer.ts'],
    outfile: 'dist/renderer/renderer.js',
    platform: 'browser',
    format: 'iife',
    loader: { '.png': 'dataurl', '.woff2': 'file', '.woff': 'file' },
  }),
]);

copyFileSync('src/renderer/index.html', 'dist/renderer/index.html');
copyFileSync('src/settings/index.html', 'dist/settings/index.html');
console.log('build ok');
