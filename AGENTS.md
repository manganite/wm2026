# Agent guide — WC 2026 Monte-Carlo Simulation

This is a finished, deployed app — a client-side Monte-Carlo simulation of the
2026 FIFA World Cup, live at **https://manganite.github.io/wm2026/**. It used
to ship with a `CLAUDE_CODE_BRIEF.md` of initial-build instructions; that brief
is gone now that everything it asked for has been built (and its "leave these
as caveats" list had quietly gone stale — every item it named has since been
resolved). This file replaces it with standing guidance for whoever — human or
agent — works in the repo next.

**Read `README.md` first.** It's the source of truth for the data schema, the
engine API, the match model and its parameters, and how the model's behaviour
was deliberately matched to FIFA's official rules. This file is about *how to
work here*, not what the app does.

## Layout

- `engine.mjs` — the verified simulation core (pure JS, no DOM). Changes to its
  logic shift every probability the app shows; treat them as significant and
  check them against `node verify.mjs`.
- `data/*.json` — hand-maintained snapshots: `teams.json` (Elo), `fixtures.json`
  (schedule + bracket), `results.json` (the single source of truth for what's
  been played — never hardcode tournament results elsewhere), and optionally
  `odds.json` (bookmaker odds for `verify.mjs`'s calibration check; dev-only,
  deliberately excluded from the sync to `public/`).
- `scripts/sync-data.mjs` — copies the browser-facing `data/*.json` into
  `public/data/` (runs automatically via the `predev`/`prebuild` npm hooks).
- `thirdPlaceAssignments.mjs` — FIFA's official Annex C best-thirds lookup table.
- `src/` — the React UI (Vite). The Monte-Carlo runs in a Web Worker so the UI
  stays responsive.

## Commands

- `npm run dev` / `npm run build` / `npm run preview` / `npm run lint`
- `node verify.mjs` — the regression + plausibility check: probability sums,
  stage-monotonicity, favourites-on-top, and (if `data/odds.json` is present) a
  calibration comparison against bookmaker odds. Keep it passing.

## Constraints

1. **Static site only** — fully client-side, deployed to GitHub Pages via
   `.github/workflows/deploy.yml` on push to `main`. No backend, no secrets.
2. **UI language: English.**
3. **`results.json` is the only place results live.** The app reads it; never
   write tournament results into code or any other data file.
4. Keep `vite.config.js`'s `base` and `src/config.js`'s `GITHUB_OWNER` /
   `GITHUB_REPO` / `RESULTS_RAW_URL` in sync with the actual repo — they encode
   the same GitHub Pages project-page coordinates from two places.
5. If you change `engine.mjs`'s rules-handling (tiebreakers, bracket structure,
   best-thirds, …), cross-check it against the official FIFA regulations the
   way the existing rules-fidelity work was — see the README's "Fidelity to
   FIFA's official rules" — and update that section's citations to match.

## Conventions

- External data that drifts (Elo ratings, bookmaker odds) is captured as a
  snapshot with a `_comment` documenting its source, capture date, format and
  methodology, plus an explicit note that it needs periodic re-capture. Follow
  that pattern for any new external data rather than wiring up a live feed.
- Comments explain *why*, not *what* — see the `_comment` fields in `data/*.json`
  and the inline notes in `engine.mjs` / `verify.mjs` for the house style.
