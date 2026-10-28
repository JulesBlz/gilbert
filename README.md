# Gilbert

**Un compagnon de bureau en pixel art, dont l'intelligence tourne entièrement sur ton ordinateur.**

Gilbert est un raton laveur qui vit sur ton écran (Mac et Windows). Il te parle, te rappelle tes échéances, trie tes mails, te fait le brief du matin, t'aide à rester concentré… et tout ça grâce à un modèle de langage local : ni compte, ni abonnement, ni cloud pour ses réponses.

> *English, in short:* a pixel-art desktop pet (Electron + TypeScript) backed by a local LLM (Gemma 4 through llama.cpp) and local speech recognition (Whisper). It reads your mail and calendar, sets reminders, runs focus sessions and chats in French, English or Vietnamese, with nothing leaving your machine. Personal project, v0.1.

## Ce qu'il sait faire

- **Discuter** : à l'écrit ou à la voix (Whisper, avec transcription en direct), en français, anglais ou vietnamien. Il a une personnalité, des humeurs, et il se souvient de toi (profil, proches, souvenirs), de façon discrète et consultable.
- **Gérer ta journée** : brief du matin (agenda, météo, tâches), bilan du soir, liste de tâches avec découpage en étapes (« décompose cette tâche »), rappels dictés (« rappelle-moi demain à 9 h de… »).
- **Lire tes mails** : connexion IMAP en continu, tri et notification de ce qui compte, recherche dans tes mails pour répondre à des questions (« qu'est-ce que Paul m'a demandé ? »), brouillons de réponse, mails qui attendent une réponse.
- **Voir ton écran** : il repère l'appli au premier plan, lit le texte à l'écran (OCR du système) et réagit (visios, vannes, aide contextuelle) ; il aide aussi sur ce que tu copies (reformuler, résumer, traduire), sans jamais toucher à ton presse-papiers.
- **Te garder concentré** : sessions de travail minutées avec glands à la clé (un gland par minute, parfois un gland doré), carnet de bord, statistiques, résumé de la semaine.
- **Vivre sur le bureau** : physique de saut et de lancer, il se laisse attraper par la queue, s'assoit sur ses fenêtres, notifie les messageries (pastilles WhatsApp / Messages), réagit à la musique (Spotify, Musique).
- **Se personnaliser** : une boutique où les glands servent à acheter des pelages et des accessoires, appliqués à toutes les animations.
- **S'installer sans effort** : un installeur `.dmg` / `.exe` ; sur Mac, Gilbert se pose sur le bureau sous la forme d'une benne verte, il en jaillit au lancement et on l'y lâche pour le quitter.

## Sous le capot

| Domaine | Choix |
|---|---|
| Application | Electron 45, TypeScript, fenêtre transparente et sans bordure, un processus principal et plusieurs fenêtres (Gilbert, réglages, carnet, connexions) |
| Modèle de langage | Gemma 4 (12B ou E4B selon la RAM) via `node-llama-cpp` ; sorties structurées par grammaire JSON (extraction de souvenirs, tri de mails, rappels, tâches) |
| Voix | Whisper via `@huggingface/transformers`, entièrement hors ligne après le premier téléchargement |
| Vision | scripts système (JXA / AppleScript sur Mac, PowerShell sur Windows) pour la fenêtre active, l'OCR et la capture |
| Mails et agenda | IMAP (`imapflow`, `mailparser`), iCal (`ical.js`), recherche plein texte BM25 maintenue localement |
| Secrets | mot de passe d'application chiffré par le trousseau du système (`safeStorage`) |
| Pixel art | animations générées puis nettoyées en grilles de pixels par des outils maison (`tools/`) ; pelages et accessoires recolorés à l'exécution |
| Build | esbuild, `electron-builder` (DMG avec fond personnalisé, NSIS), workflow GitHub Actions pour construire les deux installeurs |

Le projet représente environ 10 000 lignes de TypeScript, sans framework d'interface : les fenêtres sont du DOM natif, les animations sont dessinées sur un canevas.

### Organisation

- `src/main` : processus principal. `brain/` (modèles, personnalité, extraction, tri, rappels), `vision/` (capture et analyse de l'écran), et un module par fonction : `memory`, `assistant`, `brief`, `mail`, `mailbox`, `calendar`, `tasks`, `todo`, `focus`, `journal`, `clipboard`, `voice`, `music`, `messages`, `tidy`, `mood`, `desktop` (installation et icône du bureau)
- `src/renderer` : Gilbert lui-même (machine à états, physique, animations, bulles, sons, répliques)
- `src/settings`, `src/carnet`, `src/connections` : les fenêtres (Aujourd'hui, Guide, Boutique, Journal, Carnet, Réglages, Connexions)
- `src/shared` : types, dessins en pixels, pelages et accessoires
- `tools/` : génération et nettoyage des sprites, de la benne et des icônes ; `scripts/` : build, aperçu navigateur, tests
- `docs/cahier-des-charges.md` : la vision, le détail de chaque fonction et la feuille de route

## Lancer le projet

Prérequis : Node.js (testé avec la version 26), macOS ou Windows. Le premier lancement télécharge le modèle de langage (5 à 7 Go selon la mémoire de la machine) et celui de la voix (~250 Mo).

```bash
npm install
npm start
```

| Commande | Rôle |
|---|---|
| `npm start` | compile et lance l'appli |
| `npm run typecheck` | vérifie les types |
| `npm run preview` | aperçu dans un navigateur (http://localhost:5174), sans Electron ; `/settings/` pour la fenêtre des réglages |
| `npm run sprites` | réassemble la planche d'animation de Gilbert |
| `npm run dist:mac` | construit l'installeur Mac (`release/Gilbert-<version>-arm64.dmg`) |
| `npm run dist:win` | construit l'installeur Windows (à lancer sur Windows) |

### Tests

Les tests de comportement utilisent le vrai modèle plutôt que des simulations, pour vérifier ce que Gilbert dit et comprend réellement :

`test:brain`, `test:memory`, `test:assistant` (tri des mails, échéances), `test:brief`, `test:features` (rappels, recherche de mails, brouillons, bilan), `test:extras` (carnet, presse-papiers), `test:vision`, `test:voice`, `test:music`, `test:calendar`. Chacun se lance avec `npm run <nom>`.

## Installer et partager

1. `npm run dist:mac` produit l'installeur ; double-clic dessus, puis sur **Gilbert**.
2. L'appli n'est pas signée par Apple (pas de compte développeur) : au premier lancement, clic droit > **Ouvrir**. Si macOS la dit « endommagée » : `xattr -cr ~/Desktop/Gilbert.app`.
3. Gilbert finit l'installation seul : il se copie sur le bureau, y prend son icône de benne, range l'installeur à la corbeille et demande une fois la permission de piloter le Finder (pour retrouver sa benne).
4. Chaque personne a son propre Gilbert : cerveau, mémoire et connexions restent sur sa machine.

Sous Windows, l'installeur (`.exe`) crée un raccourci sur le bureau ; SmartScreen demande une confirmation, l'appli n'étant pas signée non plus.

## Vie privée

- Les réponses, la mémoire, la lecture de l'écran et la voix sont traitées sur la machine.
- Le réseau n'est utilisé que pour : télécharger les modèles, la météo (Open-Meteo, sans compte) et la boîte mail / l'agenda que tu connectes toi-même.
- Les données sont dans le dossier de l'application (`~/Library/Application Support/gilbert/` sur Mac, `%APPDATA%\gilbert\` sur Windows), en JSON lisible ; le mot de passe de messagerie est chiffré par le trousseau du système.

## État du projet

Projet personnel en version 0.1, testé sur Mac (Apple Silicon). Le code Windows (vision, musique, installeur) est écrit mais moins éprouvé. Pas d'intégration continue de tests, car ils demandent un vrai modèle de plusieurs Go.

## Crédits

- Raton laveur et animations de départ : modèle de coloriage trouvé en ligne (magicoloriage.com), retravaillé en pixel art ; à remplacer par un dessin original avant toute diffusion publique. La benne verte est un visuel fourni par l'auteur.
- Modèles : Gemma 4 (Google), Whisper (OpenAI), exécutés en local.
