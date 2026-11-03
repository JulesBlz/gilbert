# Choosing the brain: local model comparison

Gilbert offers three "brains" at install time and in Settings > His brain. This page explains why these three
(research done in November 2026; the figures come from secondary pages, so treat them as orders of magnitude).

## Requirements

1. **Local**: a GGUF file usable by `node-llama-cpp`, with a licence that allows redistribution.
2. **Three languages**: French (the default), English and **Vietnamese** (Gilbert's three languages).
3. **Images**: it also reads screenshots (vision).
4. **Structured output**: Gilbert has the model fill in JSON under a grammar (memory, mail triage, tasks, reminders).
5. **Size**: from a small laptop to a large Mac or PC.

## Families considered

| Family | Local sizes | Licence | Official languages | Verdict |
|---|---|---|---|---|
| **Gemma 4** (Google DeepMind, Apr-Jun 2026) | E2B (~3 GB), E4B (~5 GB), 12B (~7 GB), larger ones (26B MoE, 31B) | Apache 2.0 | 140+ languages, including Vietnamese | **Chosen**: the only family covering all three languages at every size, with vision (and audio on E2B / E4B). |
| **Ministral 3** (Mistral AI, Dec 2025) | 3B (~2 GB), 8B (~5-6 GB), 14B (~9 GB) | Apache 2.0 | ~11 languages (very good French, **no Vietnamese announced**) | Excellent for French alone; discarded because Gilbert also speaks Vietnamese. Worth revisiting for a French-only edition. |
| **Llama** (Meta): 3.2 3B, 3.1 8B | 3B, 8B | Meta licence (usage terms) | English, French, German, Italian, Portuguese, Hindi, Spanish, Thai (**no Vietnamese**) | Older, more restrictive licence. Discarded. |
| **Llama 4 Scout** | 109B (MoE) | Meta licence | 12 languages including Vietnamese | Far too large for a desktop computer. Discarded. |

Limit of this research: no page found compares these models on French at equal sizes. Before changing family, run
Gilbert's own tests (`npm run test:brain`, `test:features`, `test:web`) with the GGUF file in question.

## The three brains offered

| Tier | Model | Download | Suggested memory | For whom |
|---|---|---|---|---|
| **Light** | Gemma 4 E2B | ~3.1 GB | any machine (8 GB is enough) | small laptops, simpler answers |
| **Balanced** | Gemma 4 E4B | ~5 GB | 12 GB | the sweet spot |
| **Powerful** | Gemma 4 12B | ~7.1 GB | 20 GB | the sharpest: understands, summarises and writes better |

The suggested tier (starred) is chosen from the machine's memory, and can be changed at any time: the old brain keeps
running while the new one downloads, then Gilbert switches over.

## Sources

- [Gemma 4 moves to the Apache 2.0 licence](https://www.implicator.ai/google-releases-gemma-4-under-apache-2-0-dropping-its-custom-ai-license/)
- [Gemma 4: sizes, licence, comparison](https://webscraft.org/blog/gemma-4-povniy-oglyad-rozmiri-litsenziya-porivnyannya-z-gemma-3?lang=en)
- [Gemma 4 (OrcaRouter)](https://www.orcarouter.ai/blog/gemma-4)
- [Running Ministral 3 locally](https://tinyweights.dev/posts/run-ministral-3-locally/)
- [Ministral 3 (Unsloth)](https://unsloth.ai/docs/zh/mo-xing/tutorials/ministral-3)
- [Best small language models (KDnuggets)](https://kdnuggets.com/best-small-language-models-on-hugging-face-right-now)
