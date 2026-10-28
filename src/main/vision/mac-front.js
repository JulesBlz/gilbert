// L'appli au premier plan et la position de sa fenêtre principale (macOS), sans permission particulière.
//   osascript -l JavaScript mac-front.js → JSON { app, bundle, pid, title, bounds: { x, y, width, height } | null }
// (le titre de la fenêtre n'est donné qu'avec la permission « Enregistrement de l'écran »)
ObjC.import('AppKit');
ObjC.import('CoreGraphics');

function run() {
  const front = $.NSWorkspace.sharedWorkspace.frontmostApplication;
  const pid = front.processIdentifier;
  const out = { app: front.localizedName.js, bundle: front.bundleIdentifier.js || '', pid, title: '', bounds: null };
  // fenêtres à l'écran, de la plus en avant à la plus en arrière
  const list = ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements, $.kCGNullWindowID));
  for (let i = 0; i < list.count; i++) {
    const w = list.objectAtIndex(i);
    if (w.objectForKey('kCGWindowOwnerPID').js !== pid || w.objectForKey('kCGWindowLayer').js !== 0) continue;
    const b = w.objectForKey('kCGWindowBounds');
    const bounds = { x: b.objectForKey('X').js, y: b.objectForKey('Y').js, width: b.objectForKey('Width').js, height: b.objectForKey('Height').js };
    if (bounds.width < 80 || bounds.height < 60) continue;
    out.bounds = bounds;
    const name = w.objectForKey('kCGWindowName');
    out.title = name && !name.isNil() ? name.js : '';
    break;
  }
  return JSON.stringify(out);
}
