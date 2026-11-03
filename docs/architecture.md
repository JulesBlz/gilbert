# Gilbert: product and architecture

A pixel-art raccoon that lives on your desktop. It watches your mail and calendar, briefs you in the morning, catches
mistakes and teases you gently. Everything runs on the user's machine: no data leaves it, no subscription.

A personal project designed from day one to be installed by anyone (first-run onboarding, per-user memory, installers
for macOS, Windows and Linux).

## 1. Architecture decisions

| Topic | Choice | Why |
|---|---|---|
| Platform | **Electron + TypeScript** | One codebase for macOS, Windows and Linux. Transparent, always-on-top, click-through windows are mature; screen capture, notifications and tray icon come built in. |
| Rendering | Canvas 2D, hand-drawn pixel sprites shown at x3 to x6 without smoothing | Crisp pixels, lightweight. Fur colours and accessories are recoloured at runtime on the sprite sheet. |
| AI | **llama.cpp embedded** through `node-llama-cpp` (prebuilt binaries per platform) | 100% local and free: Metal on Mac, GPU or CPU elsewhere. Nothing to install separately (unlike Ollama). |
| Model | **Gemma 4** (Google, Apache 2.0), Q4_K_M, downloaded on first launch from Hugging Face, **three tiers chosen by RAM** (see [models.md](models.md)) | Good in French, English and Vietnamese. Vision goes through the OS's text recognition. |
| Speech | Whisper (`@huggingface/transformers`), fully offline after the first download | Voice notes with live transcription. |
| Data | Readable JSON files in the app folder (`memory.json`, `settings.json`, `projects.json`...), written atomically | Simple, inspectable, no native dependency. |
| Mail password | System keychain through `safeStorage` | Never stored in clear. |
| Brain interface | The model sits behind a `Brain` class | Another engine could be plugged in later without touching the rest. |

## 2. Integrations (free, for anyone)

- **Mail: IMAP + app password.** A continuous IMAP connection (IDLE) gives near-instant notifications. It works with
  Gmail (2-step verification plus an app password), Outlook, iCloud... The official Gmail API was ruled out: reading
  mail is a "restricted" scope, so distributing the app would require a Google verification and a paid security audit.
- **Calendar: secret iCal address.** Read-only, refreshed every 5 minutes, no developer account. Private calendars
  (iCloud, Nextcloud...) can use HTTP basic authentication, with the password encrypted like the mail one. Gilbert
  cannot create calendar events: the deadlines he detects go into his own task list.
- **Music: local control.** AppleScript on Mac, system media controls on Windows; he never launches the player.
- **Weather: Open-Meteo.** Free, no key. The city from the notebook is the only thing sent out, and only for the weather.
- **Web search: DuckDuckGo** (Wikipedia as a fallback), only when he does not know or when asked; only the query is
  sent, and the answer cites its sources. Optional.
- **Updates (macOS): GitHub Releases**, with Ed25519-signed archives (see the README).

## 3. Features

### Mail
Each new mail is triaged by the local model into important / normal / noise, with a one-line summary, a reply-needed
flag and any deadline ("by Friday"). Important mail gets an immediate bubble, even during a work session. Gilbert can
draft replies (copied to the clipboard) but **never sends anything himself**. Every mail is kept in a local index (BM25
full-text search) so he can answer questions about your mail from the mails themselves. Mails awaiting your answer
for more than two days are raised once.

### Deadlines, reminders and the evening review
A detected deadline is always *proposed* ("Shall I add it?"), never added silently. Dictated reminders ("remind me to
call Paul tomorrow at 10") are understood in all three languages. Reminders at D-3, D-1 and H-2; ignored alerts come
back, increasingly insistent and funny, at most three times. At the end of the day he reviews what is done, what is
left, tomorrow, and who is waiting for you, and warns if rain is forecast late tomorrow.

### Work sessions and acorns
"Gilbert, 25 minutes" starts a session: he sits behind a tiny pixel computer and types along. Each minute earns an
acorn, which rains onto the screen and is collected by hovering over it. A daily journal records time per app (names
only), sessions, ticked reminders and a weekly summary. While a session runs, minutes spent on listed distractions
(sites or apps) are called out after ten minutes.

### Projects
One sheet per important project: a progress gauge, a to-do list with deadlines, and a short written report that Gilbert
keeps up to date from your mail and, optionally, what he sees on screen (one line or one to-do, never the screen
itself). He reminds you of deadlines and of what you might forget, drafts replies and follow-ups, and offers to create a
sheet when a topic keeps coming back in your mail. He always asks first.

### Screen awareness (macOS and Windows, off by default)
Every 40 seconds, only if you touched the keyboard or mouse in the last 20, he reads the *text* of the foreground window
with the OS's text recognition (nothing is kept). He points out a visible error, a typo (re-read enlarged and
confirmed by the model before he says anything), a weekday that does not match its date, or a forgotten attachment,
at most once per problem and one remark every three minutes. In video calls and full-screen slides he goes quiet by
himself. Password managers and his own windows are never read.

### Memory and personality
He learns by chatting: after each message he looks for at most two things worth remembering (tastes, habits, ongoing
projects, upcoming events), all visible and editable in the notebook. Personality: a dry, teasing old hand, never
mean, with an humour slider from Sober to Unbearable and banned topics you define. Optional moods depend on how much you
play with him.

### Desktop life
A transparent window over the whole screen where only Gilbert catches the mouse. He hops, flies, perches on windows,
hides over the top edge by his tail when ignored, and reacts to the music playing, messaging badges (WhatsApp,
Messages...) and what you copy. Sounds are generated by the app (8-bit beeps and a babble voice), with no third-party
file.

### Menu, shop and guide
A window with Chat, Dashboard, Projects, Shop, Journal, Notebook and Guide tabs, plus Connections and Settings (see
[design-system.md](design-system.md)). The shop sells fur colours and hand-drawn accessories for acorns. The guide
lists what he can do, with a "Try it" button and an acorn reward for each feature actually used.

### Languages
French (default), English and Vietnamese. For Vietnamese the model gets English instructions with a Vietnamese
answer, and the UI uses the VT323 pixel font because Jersey 10 lacks stacked diacritics.

## 4. Privacy

Replies, memory, screen reading and voice are processed on the device. The network is used only to download the models,
to check GitHub for a newer version, to fetch the weather, to search the web when needed, and to reach the mailbox
and calendar you connect yourself. Data lives in the app folder as readable JSON.

## 5. Distribution

- Installers via `electron-builder`, hosted for free on GitHub Releases: `.dmg` (macOS arm64), NSIS `.exe` (Windows x64),
  `.AppImage` and `.deb` (Linux x64, experimental).
- With no budget the app is **not code-signed** (ad-hoc signature on Mac, without hardened runtime so llama.cpp can load
  its libraries): macOS asks for a confirmation on first launch (right-click > Open, or `xattr -cr`), and Windows
  SmartScreen warns. The cost is a one-time click; signing would need paid developer accounts.
- Build with `npm run dist:mac`, `dist:win` or `dist:linux`, or let the GitHub Actions workflow build all three.
- macOS permissions are requested along the way: screen recording (vision), automation (music), microphone.

## 6. Artwork

The raccoon and its starting animations are based on a colouring-page model found online and reworked into pixel art;
it should be replaced with an original drawing before any wider or commercial distribution. All sprites and
animations are generated for the project (`tools/`), then cleaned into pixel grids. Speech bubbles use the OFL font
Jersey 10 with stepped corners.

## 7. Roadmap (done)

| Phase | Content |
|---|---|
| 0 | Art direction: animal and palette |
| 1 | Gilbert lives: transparent window, animated sprites, walking, hopping, dragging, bubbles, sounds |
| 2 | Brain: embedded llama.cpp, model chosen by RAM, chat, personality, three languages |
| 3 | Memory: learning by chatting, the notebook |
| 4 | Mail and calendar: IMAP, iCal, triage, alerts, deadlines, reminders |
| 5 | Morning brief and weather |
| 6 | Vision: text reading, error and typo detection, contextual jokes, automatic quiet mode |
| 7 | Music, finishing touches, installers, long chat tab, web search, shop, work sessions |
| 8 | Projects, dark theme, quick switcher, signed updates, Windows and Linux builds |

Ideas not done yet: meeting notes from a local transcription, an index of what was on screen, user-defined routines
("if... then..."), MCP connectors.
