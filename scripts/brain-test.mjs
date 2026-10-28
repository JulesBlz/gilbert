// Teste le cerveau sans lancer l'appli : charge le modèle et pose quelques questions.
//   node scripts/brain-test.mjs [chemin/vers/modele.gguf] ["question"]
import { getLlama, LlamaChatSession, Gemma4ChatWrapper, resolveChatWrapper } from 'node-llama-cpp';
import os from 'node:os';
import path from 'node:path';
// la vraie personnalité de l'appli (Node lit le TypeScript directement)
import { systemPrompt } from '../src/main/brain/persona.ts';

const modelPath = process.argv[2]
  ?? path.join(os.homedir(), 'Library/Application Support/gilbert/models/gemma-4-12b-it-Q4_K_M.gguf');
const questions = process.argv[3] ? [process.argv[3]] : [
  'Salut Gilbert, ça va ?',
  "Tu peux me dire ce que j'ai à faire aujourd'hui ?",
  'Quelle heure est-il ?',
  'Raconte-moi une blague sur les lundis.',
];

const t0 = Date.now();
const llama = await getLlama();
const model = await llama.loadModel({ modelPath });
const context = await model.createContext({ contextSize: 4096 });
const auto = resolveChatWrapper(model);
const session = new LlamaChatSession({
  contextSequence: context.getSequence(),
  // comme dans l'appli : pas de réflexion préalable pour Gemma 4
  chatWrapper: auto instanceof Gemma4ChatWrapper ? new Gemma4ChatWrapper({ reasoning: false }) : auto ?? 'auto',
  systemPrompt: systemPrompt({ lang: 'fr', humor: 'normal' }),
});
console.log(`modèle chargé en ${((Date.now() - t0) / 1000).toFixed(1)} s (${llama.gpu})\n`);

for (const q of questions) {
  const t = Date.now();
  let first = 0;
  const answer = await session.prompt(q, {
    maxTokens: 180,
    temperature: 0.8,
    budgets: { thoughtTokens: 0 },
    onResponseChunk: (c) => {
      if (!first && c.text) first = Date.now();
    },
  });
  console.log(`> ${q}\n${answer.trim()}\n  (1er mot ${((first - t) / 1000).toFixed(1)} s, total ${((Date.now() - t) / 1000).toFixed(1)} s)\n`);
}
process.exit(0);
