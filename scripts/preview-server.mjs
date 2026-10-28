// Sert l'interface compilée dans un navigateur (sans Electron) pour tester l'animation.
//   /       → l'interface de Gilbert (dist/renderer)
//   /lab    → le labo d'animation (tools/sprite-lab.html), qui lit les sprites dans assets/
//   /settings/ → la fenêtre des réglages (onglets Réglages, Carnet, Connexions), avec des données factices
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PROJECT = process.cwd();
const RENDERER = join(PROJECT, 'dist', 'renderer');
const PORT = Number(process.env.PORT) || 5174;
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json',
};

function resolve(pathname) {
  if (pathname === '/') return join(RENDERER, 'index.html');
  if (pathname === '/lab') return join(PROJECT, 'tools', 'sprite-lab.html');
  if (pathname === '/fonts') return join(PROJECT, 'tools', 'font-lab.html');
  if (pathname.startsWith('/node_modules/@fontsource/')) return normalize(join(PROJECT, pathname));
  for (const page of ['settings']) {
    if (pathname === `/${page}/`) return join(PROJECT, 'dist', page, 'index.html');
    if (pathname.startsWith(`/${page}/`)) return normalize(join(PROJECT, 'dist', pathname));
  }
  if (pathname.startsWith('/assets/')) return normalize(join(PROJECT, pathname));
  return normalize(join(RENDERER, pathname));
}

createServer(async (req, res) => {
  const file = resolve(new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(PROJECT)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(PORT, () => console.log(`aperçu : http://localhost:${PORT}  ·  labo : http://localhost:${PORT}/lab`));
