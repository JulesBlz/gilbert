# Design system

Pixel-art UI with relief, in light and dark. A single source of truth: `src/shared/theme.css`, imported by the menu,
the notebook, the connections page and Gilbert's speech bubble. `npm run check:theme` rejects any hard-coded colour,
font size, odd measurement or raw shadow colour anywhere else.

## Principles

- **One pixel: 2 px.** Everything in the menu is drawn on a 2 px grid: borders, shadows and spacing are multiples of 2.
  Verified by measurement (`scripts/audit-pixels.js` on every page): a single text size, no odd measurement, no
  rounded corner, no native control.
- **Straight corners.** Solid outlines, never cut or rounded corners (bubbles included).
- **Three levels of surface.** Page background (`--bg`), cards (`--card`), fields (`--white`). Inside a card, use fills
  and rules rather than borders (a frame inside a frame is heavy).
- **One hero card per page**, tinted (`--hero`, edge `--hero-edge`): the day on the dashboard, "Today" in the journal,
  "Where I stand" in projects, the showcase in the shop, the first card of the guide, notebook and connections.
- **Design before text.** Explanations appear on hover (`title`) or unfold ("How to?").

## Colours

| Token | Light | Use |
|---|---|---|
| `--ink` | `#1f1b16` | text, outlines, selected state, tab rail |
| `--bg` | `#ecdfc4` | page background (a warm cream) |
| `--card` | `#fbf5e6` | cards, bubbles |
| `--white` | `#fffdf7` | input fields |
| `--line` / `--edge` | `#cfbd9a` / `#8f7e60` | rules / outlines of hollow buttons and fields |
| `--muted` | `#6d5e48` | secondary text |
| `--accent` | `#e8743b` | the orange of his "!": what gets done |
| `--good` / `--danger` | `#4c8a45` / `#b8402e` | connected, success / delete, error, late |
| `--gold*` | | reserved for acorns (the reward button) |
| `--hero`, `--on-accent`, `--rail`, `--drop` | | hero card tint, text on orange, tab rail, hard shadow |

**Dark theme.** `:root[data-theme="dark"]` redefines the same roles (`--ink` becomes the light cream, `--bg` a deep
brown, and so on). The rail, the orange and the text on orange do not change. The setting is Settings > Appearance
(Light by default, Dark, or System); `shared/theme-apply.ts` sets the attribute in the menu and on the desktop (Gilbert's
bubbles included). SVG data drawings (checkmark, bubble tails) have a dark variant.

## Type

One size: Jersey 10 is drawn on a pixel of 1/9.1 em, so at **18 px** its pixel is 2 px (measured). In Vietnamese (VT323,
pixel of 1/11 em): 22 px. Line height 24 px (26 in Vietnamese). Page titles use 27 px (3 px pixels); a project sheet's
title uses 36 px (4 px pixels). Hierarchy comes from markers (orange square before block titles), colour and space.

## Spacing

Rhythm of 8, 16 and 24 px (`--sp-2`, `--sp-4`, `--sp-5`), with 4 and 12 px for fine adjustment.

## Icons

[Pixelarticons](https://pixelarticons.com) (MIT), "sharp" variants, at **24 px**. Only icons whose strokes all fall on
a 2 px grid are kept (rasterisation test: they reduce to 12 x 12 without loss); any offset is corrected in `icons.ts`
(`SHIFT`). Small icons (plus, trash, copy, lock, close) and checkboxes are hand-drawn on a 2 px grid (`TINY`).

## Buttons

- **Orange** (`primary`): the single main action of a card.
- **Hollow** (default, `ghost`): everything else; a discreet outline that turns dark on hover.
- **Red** (`danger`): delete, after confirmation.
- **Solid dark**: only the "selected" state (a choice in a segmented control, a tag), never an action.
- Icon and list buttons never have an outline.

## Components

- Cards: a 2 px rule and a short 2 px shadow; the hard 4 px shadow only remains on markers and orange buttons.
- Fields: 2 px outline, thicker (4 px) dark orange on focus.
- Tabs: a dark vertical rail on the left, icons with their name underneath, the open tab lit in orange. At the
  bottom: acorns (always visible, with a link to the shop) and Connections / Settings.
- List column (Chat, Projects): the selection runs to the edge, against the rail.
- Status dots, tags, gauges, choice rows.
- Keyboard: a crisp orange outline on everything tabbable. Reduced motion: no animation at all.

## Behaviour

- **Motion.** A page settles in 2 px steps and never becomes invisible; nothing at all with reduced motion.
- **Feedback.** A discreet "Saved" pill appears after each setting, project sheet or notebook change.
- **Empty states.** One sentence and the first action (create a first project, turn the journal on, start a session).
- **Shortcuts** (menu): `Cmd/Ctrl+1..7` the pages, `Cmd/Ctrl+8` Connections, `Cmd/Ctrl+,` Settings, `Cmd/Ctrl+N` new chat
  (or new project from Projects), `Cmd/Ctrl+K` quick switcher (pages, projects, chats, actions). Esc closes the
  switcher, then the window.
- **Window.** Dragged by its title or the top of the rail; resized by generous handles (16 px on the right and bottom
  edges, 32 px in the corner); minimum 620 x 520; grids reflow (shop, guide, tiles, two-column fields); no scrollbars
  in the menu. Gilbert steps down while it moves and climbs back once it is released.
- **Dashboard.** "Your day" combines events, mails awaiting an answer and projects that need attention (deadlines
  coming up or passed, replies expected); a project line opens its sheet.
