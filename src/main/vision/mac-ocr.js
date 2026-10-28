// Lecture du texte d'une image avec Vision (macOS), sans rien installer : JavaScript for Automation.
//   osascript -l JavaScript mac-ocr.js <image> → JSON { lines: [{ text, x, y, w, h }] }
// Coordonnées en fraction de l'image, origine en haut à gauche.
ObjC.import('Vision');
ObjC.import('AppKit');

function run(argv) {
  const url = $.NSURL.fileURLWithPath(argv[0]);
  const handler = $.VNImageRequestHandler.alloc.initWithURLOptions(url, $());
  const request = $.VNRecognizeTextRequest.alloc.init;
  request.recognitionLevel = $.VNRequestTextRecognitionLevelAccurate;
  request.usesLanguageCorrection = false;
  request.recognitionLanguages = $(['fr-FR', 'en-US', 'vi-VT']);
  const ok = handler.performRequestsError($([request]), $());
  if (!ok) return JSON.stringify({ lines: [] });
  const results = request.results;
  const lines = [];
  for (let i = 0; i < results.count; i++) {
    const obs = results.objectAtIndex(i);
    const best = obs.topCandidates(1).objectAtIndex(0);
    const box = obs.boundingBox;
    lines.push({
      text: best.string.js,
      x: box.origin.x, y: 1 - box.origin.y - box.size.height,
      w: box.size.width, h: box.size.height,
    });
  }
  return JSON.stringify({ lines });
}
