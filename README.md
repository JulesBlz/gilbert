# Gilbert

**A pixel-art desktop companion whose intelligence runs entirely on your own computer.**

Gilbert is a raccoon who lives on your screen (macOS and Windows). He chats with you, reminds you of deadlines, triages your email, delivers a morning briefing and helps you stay focused. All of it is powered by a local language model: no account, no subscription, no cloud for his replies.

## Features

- **Conversation.** Text or voice (Whisper, with live transcription) in French, English or Vietnamese. Gilbert has a personality and moods, and he remembers you (profile, relatives, memories) in a discreet and inspectable way.
- **Daily planning.** Morning briefing (calendar, weather, tasks), evening review, a task list with automatic step breakdown, and dictated reminders ("remind me tomorrow at 9 to...").
- **Web search.** When he does not know (news, recent facts, opening hours) or when you say "search for...", he looks it up on DuckDuckGo (no account, Wikipedia as a fallback), answers from the results and names his sources. It is the only feature that leaves your machine, and it can be switched off in Settings.
- **Long conversations.** A Chat tab in the menu with several saved conversations, where Gilbert sits at the bottom left of the window and his replies appear letter by letter in speech bubbles pointing at him.
- **Email.** Continuous IMAP connection, triage and notification of what matters, full-text search to answer questions about your mail, draft replies, and a list of messages awaiting your answer.
- **Screen awareness.** Detects the foreground app, reads on-screen text through the operating system's OCR and reacts to it. Before pointing out a typo he zooms in on the spot, rereads it enlarged and has the model confirm it, so misread letters are not reported as mistakes. Also helps with what you copy (rewrite, summarise, translate) without ever overwriting your clipboard.
- **Focus.** Timed work sessions that earn acorns (one per minute) which rain down on the screen and are collected by hovering the mouse over them, a daily journal, statistics and a weekly summary.
- **Desktop life.** Physics-based jumping and throwing, perching on windows, messaging badges (WhatsApp, Messages), and reactions to the music playing (Spotify, Apple Music).
- **Projects.** One sheet per important project: a progress gauge, a to-do list with deadlines, and a short written report that Gilbert keeps up to date from your emails and (optionally) what he sees on screen. He reminds you of deadlines and of what you might forget, proposes draft replies and follow-ups, and offers to create a sheet when a topic keeps coming back in your mail (he always asks first).
- **Customisation.** A shop where acorns buy fur colours and accessories (drawn pixel by pixel, applied to every animation), a light theme (the default) and a dark one (Settings > Appearance: Light, Dark or System), a quick switcher (`Cmd/Ctrl+K`) and keyboard shortcuts.
- **Updates (macOS).** Gilbert checks GitHub for a newer release and offers to install it; the archive is signed and verified first (see "Updates" below).
- **Frictionless install.** A `.dmg` / `.exe` installer. On macOS, Gilbert settles on the desktop as a green dumpster icon: he jumps out of it at launch, and you drop him back in to quit.

## Technical overview

| Area | Choices |
|---|---|
| Application | Electron 45 and TypeScript; transparent, frameless window; a main process plus several windows (pet, settings, notebook, connections) |
| Language model | Gemma 4 in three tiers (Light E2B, Balanced E4B, Powerful 12B), chosen at install according to the machine's RAM and switchable in Settings (the old one keeps running while the new one downloads), through `node-llama-cpp`; see [docs/modeles.md](docs/modeles.md) for the comparison with Ministral and Llama; JSON-grammar constrained output for structured tasks (memory extraction, mail triage, reminders, task splitting) |
| Speech | Whisper through `@huggingface/transformers`, fully offline after the first download |
| Vision | System scripts (JXA / AppleScript on macOS, PowerShell on Windows) for the active window, OCR and capture |
| Mail and calendar | IMAP (`imapflow`, `mailparser`), iCal (`ical.js`), a locally maintained BM25 full-text index |
| Secrets | App password encrypted with the system keychain (`safeStorage`) |
| Pixel art | Animations generated, then cleaned into pixel grids by in-house tools (`tools/`); fur colours and accessories are recoloured at runtime |
| Build | esbuild, `electron-builder` (DMG with a custom background, NSIS), GitHub Actions workflow for both installers |

The project is roughly 10,000 lines of TypeScript with no UI framework: windows are plain DOM and the animations are drawn on a canvas.

### Repository layout

- `src/main`: main process. `brain/` (models, persona, extraction, triage, reminders), `vision/` (screen capture and analysis), plus one module per feature: `memory`, `assistant`, `brief`, `mail`, `mailbox`, `calendar`, `tasks`, `todo`, `focus`, `journal`, `clipboard`, `voice`, `music`, `messages`, `tidy`, `mood`, and `desktop` (installation and desktop icon).
- `src/renderer`: Gilbert himself (state machine, physics, animations, speech bubbles, sounds, lines of dialogue).
- `src/settings`, `src/carnet`, `src/connections`: the windows (Chat, Dashboard, Shop, Journal, Notebook, Guide, Connections, Settings).
- `src/shared`: shared types, pixel drawings, skins and accessories.
- `tools/`: sprite, dumpster and icon generation and cleaning. `scripts/`: build, browser preview and tests.
- `docs/cahier-des-charges.md`: the product vision, a detailed description of each feature and the roadmap (written in French).

## Getting started

Requirements: Node.js (tested with version 26) on macOS or Windows. The first launch downloads the language model (5 to 7 GB depending on the machine's memory) and the speech model (about 250 MB).

```bash
npm install
npm start
```

| Command | Purpose |
|---|---|
| `npm start` | Build and launch the app |
| `npm run typecheck` | Type-check the project |
| `npm run check:theme` | Check the stylesheets against the design charter ([docs/charte-graphique.md](docs/charte-graphique.md)) |
| `npm run preview` | Browser preview at http://localhost:5174, without Electron (`/settings/` for the settings window) |
| `npm run sprites` | Reassemble Gilbert's animation sheet |
| `npm run dist:mac` | Build the macOS installer (`release/Gilbert-<version>-arm64.dmg`) |
| `npm run dist:win` | Build the Windows installer (run it on Windows) |

### Tests

Behavioural tests run against the real model rather than mocks, to check what Gilbert actually says and understands: `test:brain`, `test:web` (when to search, search-backed answers, typo double-check), `test:memory`, `test:assistant` (mail triage, deadlines), `test:brief`, `test:features` (reminders, mail search, drafts, evening review), `test:extras` (journal, clipboard), `test:vision`, `test:voice`, `test:music` and `test:calendar`. Run any of them with `npm run <name>`.

## Installing and sharing

Download the installer from the [Releases page](https://github.com/JulesBlz/gilbert/releases): `Gilbert-<version>-arm64.dmg` for macOS, `Gilbert.Setup.<version>.exe` for Windows (x64).

Requirements: a Mac with Apple Silicon (M1 or newer), about 8 GB of free disk space (the app is about 700 MB, plus the language model), and an internet connection for the first launch.

1. Open the installer (`Gilbert-<version>-arm64.dmg`), then double-click **Gilbert**.
2. The app is not signed by Apple (no developer account), so macOS may refuse the first launch: right-click **Gilbert** and choose **Open**. If macOS reports the app as damaged, run `xattr -cr ~/Desktop/Gilbert.app` in the Terminal, then open it again.
3. Gilbert finishes the installation by himself in a few seconds: he copies himself to the desktop (where he takes the dumpster icon), restarts from there, ejects the installer and moves it to the Trash. Accept the one-time request to control Finder (it lets him find his icon).
4. On first launch he offers to download his brain (3 sizes: Light, Balanced, Powerful; the one matching your RAM is starred) and to ask a few questions about you. Both can be skipped and changed later in Settings. macOS may ask for your session password once for the keychain: choose "Always Allow".
5. Next time, double-click the dumpster on the desktop. To quit, drop Gilbert on it.

Each person gets their own Gilbert: brain, memory and connections stay on their machine. Build the installer yourself with `npm run dist:mac` (output in `release/`). Windows: the `.exe` installer (built on Windows, or by the GitHub workflow) creates a desktop shortcut; SmartScreen asks for a confirmation because the app is not signed either; the Windows code is less tested.

### Updates (maintainer)

Pushing a version tag (`npm run release` bumps the patch version, tags and pushes) makes the GitHub workflow build the installers, a signed update archive (`Gilbert-<version>-arm64.zip` + `.zip.sig`) and attach them to a release. Installed Macs check the latest release (at launch, then every 6 hours) and ask before updating.

- The archive is signed with Ed25519. The private key never enters the repository: it lives in `~/.gilbert/update-signing-key.pem` and in the repository secret `UPDATE_KEY` (`gh secret set UPDATE_KEY < ~/.gilbert/update-signing-key.pem`). The public key is in `src/main/updater.ts`; Gilbert refuses any archive whose signature (over version + SHA-256) does not match, and any version that is not newer.
- Only `github.com` addresses of this repository are followed, the download is size-capped, nothing is extracted before verification, and the extracted app must carry the expected bundle identifier and version.
- Can be switched off in Settings ("Check for updates"). Updates are macOS only (on Windows, install the new `.exe`). Versions installed before 0.2 must be reinstalled once by hand.

## Privacy

- Replies, memory, screen reading and voice are all processed on the device. Project sheets (optional) may keep one short line or a to-do taken from an email or a window that mentions the project; no image or screen text is stored.
- The network is used only to download the models, to check GitHub for a newer version (an anonymous request; optional), to fetch the weather (Open-Meteo, no account), to search the web when he needs to (only the question is sent, to DuckDuckGo; optional) and to reach the mailbox and calendar you connect yourself.
- Data lives in the application folder (`~/Library/Application Support/gilbert/` on macOS, `%APPDATA%\gilbert\` on Windows) as readable JSON; the mail password is encrypted by the system keychain.

## Project status

A personal project at version 0.2, tested on macOS (Apple Silicon). The Windows code (vision, music, installer) is written but less thoroughly tested. There is no automated test pipeline, since the tests need a real model of several gigabytes. No licence has been chosen yet.

## Credits

- The raccoon and its starting animations are based on a colouring-page model found online (magicoloriage.com) and reworked into pixel art; it should be replaced with an original drawing before any wider distribution. The green dumpster is a visual supplied by the author.
- Models: Gemma 4 (Google) and Whisper (OpenAI), run locally.
