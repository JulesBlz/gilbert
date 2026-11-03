# Choix du cerveau : comparatif des modèles locaux

Gilbert propose trois « cerveaux » à l'installation et dans Réglages > Son cerveau. Voici pourquoi ces trois-là
(recherche faite en novembre 2026 ; les chiffres viennent de pages secondaires, à prendre comme des ordres de grandeur).

## Ce qu'on exige d'un modèle

1. **Local** : un fichier GGUF utilisable par `node-llama-cpp`, avec une licence qui permet de le distribuer.
2. **Trois langues** : français (par défaut), anglais et **vietnamien** (les trois langues de Gilbert).
3. **Images** : il lit aussi des captures d'écran (vision).
4. **Sorties structurées** : Gilbert lui fait remplir du JSON (mémoire, tri de mails, tâches, rappels) sous grammaire.
5. **Taille** : du petit portable au gros Mac / PC.

## Les familles regardées

| Famille | Tailles locales | Licence | Langues officielles | Verdict |
|---|---|---|---|---|
| **Gemma 4** (Google DeepMind, avril-juin 2026) | E2B (~3 Go), E4B (~5 Go), 12B (~7 Go), plus grands (26B MoE, 31B) | Apache 2.0 | 140+ langues, dont le vietnamien | **Retenue** : seule famille qui couvre nos trois langues à toutes les tailles, avec vision (et audio sur E2B / E4B). |
| **Ministral 3** (Mistral AI, déc. 2025) | 3B (~2 Go), 8B (~5-6 Go), 14B (~9 Go) | Apache 2.0 | ~11 langues (français très bon, **pas de vietnamien annoncé**) | Excellente pour le français seul ; écartée parce que Gilbert parle aussi vietnamien. À reconsidérer pour une version 100 % française. |
| **Llama** (Meta) : 3.2 3B, 3.1 8B | 3B, 8B | licence Meta (conditions d'usage) | anglais, français, allemand, italien, portugais, hindi, espagnol, thaï (**pas de vietnamien**) | Plus ancienne, licence plus contraignante. Écartée. |
| **Llama 4 Scout** | 109B (MoE) | licence Meta | 12 langues dont le vietnamien | Bien trop gros pour un ordinateur de bureau. Écartée. |

Limite de cette recherche : aucune page trouvée ne compare ces modèles sur le français à tailles égales. Avant de
changer de famille, il faudrait lancer les tests de Gilbert (`npm run test:brain`, `test:features`, `test:web`) avec
le fichier GGUF en question.

## Les trois cerveaux proposés

| Palier | Modèle | Téléchargement | Mémoire conseillée | Pour qui |
|---|---|---|---|---|
| **Léger** | Gemma 4 E2B | ~3,1 Go | toute machine (8 Go suffisent) | petit portable, réponses plus simples |
| **Équilibré** | Gemma 4 E4B | ~5 Go | 12 Go | le bon compromis |
| **Puissant** | Gemma 4 12B | ~7,1 Go | 20 Go | le plus fin : comprend, résume et rédige mieux |

Le palier conseillé (une étoile) est choisi d'après la mémoire de la machine. On peut changer quand on veut :
l'ancien cerveau continue de tourner pendant le téléchargement du nouveau, puis Gilbert bascule.

## Sources

- [Gemma 4 passe sous licence Apache 2.0](https://www.implicator.ai/google-releases-gemma-4-under-apache-2-0-dropping-its-custom-ai-license/)
- [Gemma 4 : tailles, licence, comparaison](https://webscraft.org/blog/gemma-4-povniy-oglyad-rozmiri-litsenziya-porivnyannya-z-gemma-3?lang=en)
- [Gemma 4 (OrcaRouter)](https://www.orcarouter.ai/blog/gemma-4)
- [Exécuter Ministral 3 en local](https://tinyweights.dev/posts/run-ministral-3-locally/)
- [Ministral 3 (Unsloth)](https://unsloth.ai/docs/zh/mo-xing/tutorials/ministral-3)
- [Meilleurs petits modèles (KDnuggets)](https://kdnuggets.com/best-small-language-models-on-hugging-face-right-now)
