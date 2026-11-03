// Vérifie que la charte graphique est respectée partout : dans les feuilles de style (hors theme.css),
// aucune couleur écrite en dur, aucune taille de texte qui ne vienne de l'échelle, aucun contour
// ou ombre en couleur brute, aucune mesure impaire (la grille est de 2 px). Sortie non nulle au moindre écart.
//   npm run check:theme

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.join(process.cwd(), 'src');
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.css') && !p.endsWith(path.join('shared', 'theme.css'))) files.push(p);
  }
})(root);

// seul le faux fond de bureau de l'aperçu navigateur échappe à la charte
const ALLOWED = [/#4a5a78/];
// les couleurs des données SVG (les queues de bulle) sont celles de la charte : encre et carte, en clair et en sombre
const SVG_COLORS = new Set(['%231f1b16', '%23fbf5e6', '%23f1e8d4', '%2326211a']);

let bad = 0;
for (const file of files) {
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    const where = `${path.relative(process.cwd(), file)}:${i + 1}`;
    const report = (why) => { bad++; console.log(`${where}  ${why}  →  ${line.trim().slice(0, 100)}`); };
    for (const m of line.matchAll(/(?<![%&\w])#[0-9a-fA-F]{3,8}\b/g)) if (!ALLOWED.some((a) => a.test(m[0]))) report(`couleur en dur ${m[0]}`);
    for (const m of line.matchAll(/%23[0-9a-fA-F]{6}/g)) if (!SVG_COLORS.has(m[0].toLowerCase())) report(`couleur hors charte dans un SVG ${m[0]}`);
    if (/\brgba?\(/.test(line)) report('rgba() en dur');
    if (/font-size:\s*[0-9.]+px/.test(line)) report('taille de texte en dur');
    if (/font:\s*[0-9.]+px/.test(line)) report('taille de texte en dur (font)');
    // la grille : le pixel de l'interface fait 2 px, donc toute mesure est paire (1 px seulement pour un champ caché)
    if (!/opacity: 0; pointer-events: none/.test(line)) for (const m of line.matchAll(/(?<![\d.#%\w-])(\d*[13579])px\b/g)) report(`mesure impaire ${m[0]} (la grille est de 2 px)`);
  });
}
console.log(bad ? `\n${bad} écart${bad > 1 ? 's' : ''} à la charte.` : `Charte respectée (${files.length} feuilles de style).`);
process.exit(bad ? 1 : 0);
