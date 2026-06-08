# WC 2026 Monte-Carlo Simulation

**Live app: https://manganite.github.io/wm2026/**

Client-side Monte-Carlo simulation of the 2026 FIFA World Cup — a tournament
outlook (title/stage probabilities for all 48 teams), per-match predictions, a
knockout bracket that fills in as real results land, and illustrative
"start point" projections that play the whole bracket forward from today's
most-likely outcomes. Everything runs in the browser, off the main thread.
The engine itself is a pure-JS module (Node + browser); played results are
hand-maintained in one JSON file and everything not yet played is simulated.
Deployed as a static site on GitHub Pages. **UI language: English.**

## Repo layout

```
data/teams.json      48 teams: code, name, group, confed, elo (live ratings snapshot)
data/fixtures.json   72 group matches (real schedule) + full knockout structure
data/results.json    hand-edited played results: { matches: { "GE1": [3,0], ... } }
data/odds.json       optional dev-only snapshot: bookmaker odds for the calibration check below
engine.mjs           simulation engine (no DOM) — the verified core
verify.mjs           Node script: runs the MC and checks plausibility
```

## Run the verifier

```
node verify.mjs
```

Expected: title probs sum to ~1.0, R32 probs sum to ~32, stage probs monotone,
favourites (Spain, Argentina, France, England, Brazil) on top.

It also runs a **calibration check** against a captured snapshot of bookmaker
outright-winner odds (`data/odds.json`, present only if you've added one — see
its `_comment` for the source/date and how to recreate it; the check
self-skips with a one-line note if the file is absent). It converts the odds
to overround-free implied probabilities and prints them side-by-side with the
model's title probabilities, plus a Spearman rank correlation (agreement on
*who's more likely than whom* — the meaningful comparison, since the model
isn't tuned to match bookmakers) and the mean absolute difference in
percentage points. This is a **plausibility signal, not a scoring rule** —
both sides are snapshots that drift (the Elo feed and bookmaker odds alike),
so treat it as a periodic sense-check, not a pass/fail gate.

The snapshot captured 2026-06-07 (FanDuel, via Fox Sports — see
`data/odds.json`) showed broad agreement: Spearman ρ ≈ 0.80 across the 21
teams bookmakers quote outright odds for, mean absolute difference ≈ 2.5
percentage points. The largest gaps were the model rating Spain and Argentina
noticeably *higher* than the market (+10pp and +9pp) and England, Brazil and
Germany somewhat *lower* (−5, −5, −4pp) — plausibly because Elo (this model's
only signal) and bookmaker prices weigh different things (squad news, market
sentiment, historical tournament pedigree) — and the model giving the USA and
Sweden ~0% versus the market's ~1%, the kind of long-tail disagreement a
goals-only Elo-driven model will always have with markets that price in more
than results.

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

## Start points & projections (UI)

Beyond simulating from the real entered results, the app can also simulate
forward from a hypothetical "start point" where undecided matches are filled
in with the model's modal outcome (`src/lib/selectors.js`,
`pickMostLikelyScore`: argmax of the tendency, then that outcome's
most-likely conditional score):

- **Pre-tournament** — the real results as entered, nothing synthesized.
- **After groups** — only the 72 group matches are filled in; the knockout
  bracket shows advancement probabilities from the simulation.
- **After R32 / After R16 / After QF / After SF** — group matches filled in,
  then knockout matches resolved and synthesized stage-by-stage up to and
  including that round (via `buildKnockoutResolution`); later rounds still
  show advancement probabilities from the simulation.
- **Full tournament** — all 103 matches synthesized (group stage + all five
  knockout rounds, R32 through Final).

These are explicitly illustrative, never forecasts: chaining "most likely"
picks round by round compounds to one low-probability path through the
bracket, not a prediction of what will happen (see the in-app caption).

Synthesizing a *complete* bracket needs every tie broken — including
cross-group best-thirds ties that, with everyone's score fixed at their modal
outcome, come up far more often than in real (or simulated-with-variance)
tournaments. The real bracket view rightly refuses to call those (a genuine
undecided lots draw isn't "concretely known yet" — `resolveGroupStandings`'s
double-seed agreement check), but a projection has no "wait and see": every
match needs two named teams. So `buildKnockoutResolution` takes an optional
`{ tieBreakSeed }` that commits to a single, fixed, reproducible draw of lots
instead of demanding two random seeds agree — all projected start points and
their bracket views pass the same `PROJECTION_TIE_BREAK_SEED` so the teams a
score was synthesized for are exactly the teams the bracket displays it between.

The knockout bracket also shows, for each not-yet-decided slot, which teams
the simulation actually has reaching it and how often (`slotAdvancement` in
`runMonteCarlo`'s return — a tally, across every Monte-Carlo run, of which
team fills each `{matchId}:{home|away}` slot). This works uniformly for
every reference kind (group winner/runner-up/best-third/winner-of-match)
since it just records what `simulateTournament` already resolves each run.

## Deployment (GitHub Pages)

Live at **https://manganite.github.io/wm2026/** — a static site, no backend.
`.github/workflows/deploy.yml` builds (`npm run build`, which runs
`scripts/sync-data.mjs` to copy the browser-facing `data/*.json` into
`public/data/` before the Vite build) and deploys via
`actions/upload-pages-artifact` + `actions/deploy-pages` on every push to
`main`. As a project page rather than a user/org page, `vite.config.js` sets
`base: '/wm2026/'` — keep that, the repo name, and `src/config.js`'s
`GITHUB_OWNER`/`GITHUB_REPO`/`RESULTS_RAW_URL` in sync if the repo ever moves.
The Monte-Carlo runs in a Web Worker, so the UI stays responsive while it churns.

## Fidelity to FIFA's official rules

Four areas of the model that could easily have been left as simplifying
stand-ins were instead matched to the official 2026 regulations and Annexes,
and are documented here with their sources so the choice is checkable rather
than assumed:

- **Best-thirds assignment** uses FIFA's official Annex C lookup table verbatim
  (495 rows — one per possible combination of which 8 of the 12 groups produce
  a qualifying third-placed team), extracted from the WC 26 Regulations and
  verified for full, gap-free coverage of all C(12,8) combinations — see
  `thirdPlaceAssignments.mjs`.
- **Elo values** are live World Football Elo ratings pulled from eloratings.net
  (captured 2026-06-08 — see the `_comment` in `data/teams.json`). Ratings
  drift after every match, including friendlies, so this is a snapshot rather
  than a continuously-synced feed: re-capture before relying on the numbers for
  a date far from the one recorded there.
- **R16+ bracket adjacency** mirrors FIFA's official knockout schedule
  (Match 73–104: R32 = 73–88, R16 = 89–96, QF = 97–100, SF = 101–102,
  Final = 104) verbatim — every `R32-N` here is the unique official match with
  that exact group-reference pair, and every R16/QF/SF/Final pairing follows
  the official "winner of match X meets winner of match Y" tree, not a
  same-order stand-in — see the `_comment` in `data/fixtures.json`.
- **Group tiebreakers** follow Article 13 of the official 2026 regulations:
  points, then — for teams level on points — a head-to-head mini-league
  (points/GD/GF from just their mutual matches, recursively re-applied to
  whichever subset still can't be separated), then overall GD, overall GF.
  Article 13's two remaining criteria, team conduct ("fair play") score and
  FIFA World Ranking, fold into a single random draw in `simulateGroup`'s
  fallback: this goals-only model has no card/discipline data to compute the
  former, and Elo — the rating system this project uses, see the `_comment` in
  `data/teams.json` — is not a substitute for the latter. That draw is an
  honest, unbiased resolution of a tie the model genuinely has no signal on,
  not a stand-in for those rules. `pickBestThirds` mirrors the same idea for
  the simpler (head-to-head-free) best-thirds chain.

