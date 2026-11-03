// La fenêtre du menu n'a pas de cadre système : on la déplace par son titre ou le haut du rail (zones « drag » en CSS),
// et on la redimensionne par des poignées assez larges (le bord droit, le bord bas, l'angle), que cette fonction pose.

export function mountWindowChrome(resize: (width: number, height: number) => void, move: (x: number, y: number) => void) {
  // le déplacement : par le titre et le haut du rail. Les zones « drag » du CSS le font déjà quand le système les honore ;
  // ceci le fait aussi à la souris sinon (les boutons et les champs gardent leur clic)
  let grab: { x: number; y: number; wx: number; wy: number } | null = null;
  let moving = 0;
  document.addEventListener('pointerdown', (e) => {
    const target = e.target as HTMLElement;
    if (e.button !== 0 || !target.closest('.content > header, .rail .logo, .rail .rail-fill') || target.closest('button, input, textarea, select, a')) return;
    grab = { x: e.screenX, y: e.screenY, wx: window.screenX, wy: window.screenY };
    document.body.setPointerCapture?.(e.pointerId);
  });
  document.addEventListener('pointermove', (e) => {
    if (!grab) return;
    const g = grab;
    cancelAnimationFrame(moving);
    moving = requestAnimationFrame(() => move(g.wx + e.screenX - g.x, g.wy + e.screenY - g.y));
  });
  const drop = () => { grab = null; };
  document.addEventListener('pointerup', drop);
  document.addEventListener('pointercancel', drop);

  for (const edge of ['r', 'b', 'rb'] as const) {
    const grip = document.createElement('div');
    grip.className = `grip grip-${edge}`;
    grip.setAttribute('aria-hidden', 'true');
    let start: { x: number; y: number; w: number; h: number } | null = null;
    let frame = 0;
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      start = { x: e.screenX, y: e.screenY, w: window.outerWidth, h: window.outerHeight };
    });
    grip.addEventListener('pointermove', (e) => {
      if (!start) return;
      const s = start;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => resize(edge === 'b' ? s.w : s.w + e.screenX - s.x, edge === 'r' ? s.h : s.h + e.screenY - s.y));
    });
    const stop = (e: PointerEvent) => { start = null; if (grip.hasPointerCapture(e.pointerId)) grip.releasePointerCapture(e.pointerId); };
    grip.addEventListener('pointerup', stop);
    grip.addEventListener('pointercancel', stop);
    document.body.append(grip);
  }
}
