// Audit de la grille de pixels du menu, à coller dans la console de l'aperçu (npm run preview, puis
// http://localhost:5174/settings/#home) : il parcourt chaque onglet et rend, par onglet, les tailles de texte, les
// hauteurs de ligne, les angles arrondis, les ombres / contours / marges impairs, les contrôles natifs et l'échelle
// des icônes. Attendu : une seule taille de texte, aucune anomalie, icônes à l'échelle 1 (Pixelarticons, 2 px la case)
// ou 2 (petites icônes dessinées sur 2 px).
(async () => {
  const audit = () => {
    const out = { fonts: {}, lh: {}, radius: 0, oddShadow: [], oddBorder: [], oddPad: [], svg: {}, native: [] };
    for (const e of [...document.querySelectorAll('body *')].filter((x) => x.getClientRects().length)) {
      const cs = getComputedStyle(e), tag = e.tagName.toLowerCase();
      if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
        const k = `${cs.fontFamily.split(',')[0]} ${cs.fontSize}`;
        out.fonts[k] = (out.fonts[k] || 0) + 1;
        out.lh[cs.lineHeight] = (out.lh[cs.lineHeight] || 0) + 1;
      }
      if (cs.borderTopLeftRadius !== '0px') out.radius++;
      const sh = cs.boxShadow;
      if (sh && sh !== 'none' && [...sh.matchAll(/(-?\d+(?:\.\d+)?)px/g)].some((m) => parseFloat(m[1]) % 2)) out.oddShadow.push(`${tag}.${e.className}`);
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        if (parseFloat(cs[`border${side}Width`]) % 2) out.oddBorder.push(`${tag}.${e.className}`);
        const p = parseFloat(cs[`padding${side}`]);
        if (p % 2 && Math.abs(p - Math.round(p)) < 0.01) out.oddPad.push(`${tag}.${e.className}`);
      }
      if (tag === 'svg') {
        const k = (parseFloat(e.getAttribute('width')) / Number((e.getAttribute('viewBox') || '').split(' ')[2])).toFixed(2);
        out.svg[k] = (out.svg[k] || 0) + 1;
      }
      if (tag === 'input' && cs.appearance !== 'none' && !['range', 'text', 'email', 'password', 'number', 'date', 'url'].includes(e.type)) out.native.push(e.type);
    }
    return out;
  };
  document.body.style.cssText = 'width:700px;height:780px;position:relative;overflow:hidden'; // la taille réelle de la fenêtre
  const res = {};
  for (const name of ["Aujourd'hui", 'Discussion', 'Guide', 'Boutique', 'Journal', 'Carnet']) {
    [...document.querySelectorAll('nav.tabs:not([hidden]) button.tab')].find((x) => x.title === name)?.click();
    await new Promise((r) => setTimeout(r, 500));
    res[name] = audit();
  }
  document.querySelector('button.gear').click();
  await new Promise((r) => setTimeout(r, 400));
  res['Réglages'] = audit();
  [...document.querySelectorAll('nav.gear-tabs button.tab')].find((x) => x.title === 'Connexions')?.click();
  await new Promise((r) => setTimeout(r, 400));
  res['Connexions'] = audit();
  console.log(JSON.stringify(res, null, 1));
})();
