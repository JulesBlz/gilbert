# Gilbert

**A pixel-art desktop companion whose intelligence runs entirely on your own computer.**

Gilbert is a raccoon who lives on your screen (macOS and Windows). He chats with you, reminds you of deadlines, triages your email, delivers a morning briefing and helps you stay focused. All of it is powered by a local language model: no account, no subscription, no cloud for his replies.

## Features

- **Conversation.** Text or voice (Whisper, with live transcription) in French, English or Vietnamese. Gilbert has a personality and moods, and he remembers you (profile, relatives, memories) in a discreet and inspectable way.
- **Daily planning.** Morning briefing (calendar, weather, tasks), evening review, a task list with automatic step breakdown, and dictated reminders ("remind me tomorrow at 9 to...").
- **Email.** Continuous IMAP connection, triage and notification of what matters, full-text search to answer questions about your mail, draft replies, and a list of messages awaiting your answer.
- **Screen awareness.** Detects the foreground app, reads on-screen text through the operating system's OCR and reacts to it. Also helps with what you copy (rewrite, summarise, translate) without ever overwriting your clipboard.
- **Focus.** Timed work sessions that earn acorns (one per minute, occasionally a golden one), a daily journal, statistics and a weekly summary.
- **Desktop life.** Physics-based jumping and throwing, perching on windows, messaging badges (WhatsApp, Messages), and reactions to the music playing (Spotify, Apple Music).
- **Customisation.** A shop where acorns buy fur colours and accessories, applied to every animation.
- **Frictionless install.** A `.dmg` / `.exe` installer. On macOS, Gilbert settles on the desktop as a green dumpster icon: he jumps out of it at launch, and you drop him back in to quit.

## Technical overview

| Area | Choices |
|---|---|
| Application | Electron 45 and TypeScript; transparent, frameless window; a main process plus several windows (pet, settings, notebook, connections) |
| Language model | Gemma 4 (12B or E4B depending on available RAM) through `node-llama-cpp`; JSON-grammar constrained output for structured tasks (memory extraction, mail triage, reminders, task splitting) |
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
- `src/settings`, `src/carnet`, `src/connections`: the windows (Today, Guide, Shop, Journal, Notebook, Settings, Connections).
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
| `npm run preview` | Browser preview at http://localhost:5174, without Electron (`/settings/` for the settings window) |
| `npm run sprites` | Reassemble Gilbert's animation sheet |
| `npm run dist:mac` | Build the macOS installer (`release/Gilbert-<version>-arm64.dmg`) |
| `npm run dist:win` | Build the Windows installer (run it on Windows) |

### Tests

Behavioural tests run against the real model rather than mocks, to check what Gilbert actually says and understands: `test:brain`, `test:memory`, `test:assistant` (mail triage, deadlines), `test:brief`, `test:features` (reminders, mail search, drafts, evening review), `test:extras` (journal, clipboard), `test:vision`, `test:voice`, `test:music` and `test:calendar`. Run any of them with `npm run <name>`.

## Installing and sharing

1. `npm run dist:mac` produces the installer. Open it, then double-click **Gilbert**.
2. The app is not signed by Apple (no developer account), so on first launch right-click it and choose **Open**. If macOS reports the app as damaged, run `xattr -cr ~/Desktop/Gilbert.app`.
3. Gilbert completes the installation on his own: he copies himself to the desktop, takes on the dumpster icon, moves the installer to the Trash and asks once for permission to control Finder (to locate his icon).
4. Each person gets their own Gilbert: brain, memory and connections stay on their machine.

On Windows, the `.exe` installer creates a desktop shortcut; SmartScreen asks for a confirmation because the app is not signed either.

## Privacy

- Replies, memory, screen reading and voice are all processed on the device.
- The network is used only to download the models, to fetch the weather (Open-Meteo, no account) and to reach the mailbox and calendar you connect yourself.
- Data lives in the application folder (`~/Library/Application Support/gilbert/` on macOS, `%APPDATA%\gilbert\` on Windows) as readable JSON; the mail password is encrypted by the system keychain.

## Project status

A personal project at version 0.1, tested on macOS (Apple Silicon). The Windows code (vision, music, installer) is written but less thoroughly tested. There is no automated test pipeline, since the tests need a real model of several gigabytes. No licence has been chosen yet.

## Credits

- The raccoon and its starting animations are based on a colouring-page model found online (magicoloriage.com) and reworked into pixel art; it should be replaced with an original drawing before any wider distribution. The green dumpster is a visual supplied by the author.
- Models: Gemma 4 (Google) and Whisper (OpenAI), run locally.
