# WC 2026 Monte-Carlo Simulation

Client-side Monte-Carlo simulation of the 2026 FIFA World Cup. The engine is a
pure-JS module (Node + browser). Played results are hand-maintained in one JSON
file; everything not yet played is simulated. Built to be deployed as a static
GitHub Pages site. **UI language: English.**

## Repo layout

```
data/teams.json      48 teams: code, name, group, confed, elo (approximate seeds)
data/fixtures.json   72 group matches (real schedule) + full knockout structure
data/results.json    hand-edited played results: { matches: { "GE1": [3,0], ... } }
engine.mjs           simulation engine (no DOM) — the verified core
verify.mjs           Node script: runs the MC and checks plausibility
```

## Run the verifier

```
node verify.mjs
```

Expected: title probs sum to ~1.0, R32 probs sum to ~32, stage probs monotone,
favourites (Spain, Argentina, France, England, Brazil) on top.

## Match model

Goals are Poisson-distributed with a Dixon-Coles low-score correction.
`lambda` comes from the Elo gap: goal supremacy = eloDiff / `ELO_PER_GOAL`,
split around `BASE_TOTAL`. All knobs live in `PARAMS` in `engine.mjs`:

| param | meaning | default |
|---|---|---|
| `BASE_TOTAL` | avg total goals, even match | 2.65 |
| `ELO_PER_GOAL` | Elo gap worth ~1 goal | 220 |
| `HOME_ADV` | home Elo bonus (neutral WC) | 0 |
| `RHO` | Dixon-Coles dependence | -0.06 |
| `ET_FACTOR` | extra-time goal scaling | 1/3 |

## Engine API

```js
import { runMonteCarlo, predictMatch } from "./engine.mjs";

const { probs, predictions } = runMonteCarlo(data, results, N, seed);
// probs[code]   = { R32, R16, QF, SF, F, W }  (probabilities)
// predictions[] = per group match: { mostLikely, top3, tendency, expectedGoals }
//                 or { played:true, score:[h,a] } once a result is entered
```

`predictMatch(eloHome, eloAway)` returns the descriptive prediction for one
fixture: most-likely exact score (with probability), top-3 scores, W/D/L
tendency, and expected goals. Note: the modal score and the tendency can point
different ways (e.g. most-likely 1:1 while the favourite still has the higher
win probability) — show both.

## Adapting to the live tournament

`results.json` is the single source of truth. Each entry maps a match `id` to
`[homeGoals, awayGoals]`. Anything absent is simulated. The same code runs
pre-tournament (empty results) and at every later stage (more entries fixed).
Group results re-shape the standings; knockout results prune the bracket.

**Knockout matches decided on penalties** (level after extra time) need the
shootout winner as a 3rd element, since a knockout match must have a winner:

```
"R32-1": [1, 1, "BRA"]    // 1-1, Brazil won the shootout
"R16-3": [2, 2, "H"]      // or "H"/"A" for home/away
"QF-2":  [2, 1]           // decisive score -> no token needed
```

If you enter a level score with no winner token, the engine estimates the
shootout via its penalty model (slight Elo edge) — so always add the token for
real results.

To update during the tournament: edit `data/results.json`, commit, push.
The deployed app fetches the file (raw GitHub URL or same-origin) and re-runs.

## Deployment (GitHub Pages)

Static site → Pages fits directly, no backend. Build the UI (e.g. Vite + React)
and add a Pages deploy workflow. For a project page, set the Vite `base` to
`/<repo>/`. Web Workers work on Pages, so the MC can run off the main thread.

## Documented caveats (to refine for full fidelity)

1. **Elo values are approximate seeds.** Replace with live eloratings.net values.
2. **Best-thirds assignment** uses FIFA's official Annex C lookup table verbatim
   (495 rows — one per possible combination of which 8 of the 12 groups produce
   a qualifying third-placed team), extracted from the WC 26 Regulations and
   verified for full, gap-free coverage of all C(12,8) combinations — see
   `thirdPlaceAssignments.mjs`.
3. **R16+ bracket adjacency** pairs consecutive R32 winners — a clean stand-in.
   Swap in the official adjacency if the precise semifinal pairings matter.
4. **Group tiebreakers** follow GD → GF → head-to-head → (random for fair-play /
   lots). Order is easy to change in `simulateGroup`.
5. **Calibration**: compare title probabilities against bookmaker odds and
   back-test before trusting the numbers.
