# Midpoint presentation deck

A 13-slide deck as a Vite + React + TypeScript app. Fixed 1920 x 1080 stage,
scaled to any window, dark throughout, fonts bundled (no internet needed).

## Run

```powershell
cd presentation
npm install        # once
npm run dev        # http://127.0.0.1:5173
```

Open the URL, press `F` for fullscreen, `S` for the presenter window.

## Keys

| Key | Action |
| --- | --- |
| Right, Space, PageDown, N | next (advances a fragment first) |
| Left, PageUp, P | previous |
| Home / End | first / last slide |
| digits, then Enter | jump to that slide number |
| F | toggle fullscreen |
| B | black screen |
| S | open the presenter window (`/?presenter`) |
| Esc | overview grid of all slides; click one to jump |
| ? | keyboard help |
| click right / left half | next / previous |

The URL hash `#/<slide>/<fragment>` holds the position; a reload returns
to the same place. Both windows stay in sync over a `BroadcastChannel`, and
either can drive.

## Other views

- `/?presenter`: current slide, next slide, notes (32px), elapsed timer since
  the first advance, and the slide's time window. The timer turns orange and
  says OVER when the elapsed time passes the window's end.
- `/?print`: all slides stacked at 1920 x 1080 with every fragment shown and no
  animation. Ctrl+P to PDF gives a backup copy (`@page` is 1920px x 1080px).

## Screenshots on slide 4

Drop `public/screenshots/ci-log.png` and/or `wazuh-alert.png` in place and
restart the dev server; the panels show the images instead of the text version.
The check happens once, at dev-server start or build time.

## Verify

```powershell
npm run verify          # screenshots + geometry audit, keyboard drive, presenter, print, reduced motion, motion frames
npm run verify:shots    # screenshots and audit only
npm run verify:drive    # keyboard / presenter / print / reduced motion only
```

Screenshots land in `verify/` (git-ignored). Playwright's Chromium is needed
once: `npx playwright install chromium`.

## Layout

- `src/slides/*.tsx`: one slide per module with its notes and time window;
  `src/slides/index.ts` is the ordered deck.
- `src/components/`: `Stage`, `Chrome`, `PipelineStrip`, `LabMap`,
  `RollingNumber`, `Typewriter`, `BigStat`, `DataTable`, `Overview`,
  `HelpOverlay`, `Presenter`, `PrintView`, `SlideView`.
- `src/hooks/useDeckState.ts`: slide + fragment state, hash, channel, keys.
- `src/deck.tsx`: fragment / motion context and the `Stagger`, `Item`,
  `Fragment`, `Reveal` entrance helpers.
- `src/styles/tokens.css`: palette, type scale, spacing. The only file with hex.
