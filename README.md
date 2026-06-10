# WC 2026 Monte-Carlo Simulation

**Live app: https://manganite.github.io/wm2026/**

Client-side Monte-Carlo simulation of the 2026 FIFA World Cup. Runs entirely
in your browser: no backend, no server. The engine samples thousands of
complete tournaments — respecting the real schedule, official knockout bracket,
and FIFA tiebreaker rules — and aggregates the results into the statistics
shown in the app. Played results are hand-maintained in one JSON file; every
match not yet played is simulated.

---

## What the app shows and how it's calculated

### Title and stage probabilities ("Tournament outlook" table)

The engine runs **N complete tournaments** (default 15 000, adjustable in the
UI up to 100 000). In each run it
simulates every unplayed match by sampling a scoreline from the match model
(see below), applies the official tiebreaker rules to determine group rankings,
and propagates winners through the knockout bracket all the way to a champion.

The probabilities in the table are simply **counts / N**:

- **Reach R32** — fraction of runs where this team advanced from the group stage.
- **Reach R16 / QF / SF / Final** — fraction of runs where they reached at least that round.
- **Title** — fraction of runs where they won the Final.

These are *cumulative* — a team that wins the tournament is counted in all six
columns, not just "Title". Stage probabilities therefore always decrease from
left to right.

### "How far will each team go?" (Progression chart)

Each horizontal bar is a **probability distribution over exit stages**: it
shows the probability that this team's tournament *ends exactly at* each
round. The segments are the differences between consecutive cumulative
probabilities — e.g. the "Lost in R32" segment is `P(reach R32) − P(reach
R16)`. All segments for one team sum to 100%.

Teams are ranked by title probability. The chart shows the top 12 by default;
click "Show all 48 teams" to expand.

### Timeline — how the picture has evolved

Every other section answers "what does the model think *now*?". The Timeline
section answers "how did we get here?": how each team's title probability,
exit-stage distribution, and group-qualification odds changed as real results
were entered, match day by match day.

**No history is stored.** Each point on the timeline is computed from
scratch: the app takes the subset of `results.json` whose fixtures were
played on or before that date, conditions the engine on just that subset, and
re-runs the Monte-Carlo simulation. The seeded RNG (`DEFAULT_SEED`) makes
every point reproducible, so the whole timeline is always derivable from
`fixtures.json` (dates, including the knockout match dates) + `results.json`
(scores) alone — there's a `t0` point (empty conditioning, the
pre-tournament prior) plus one point per date that has at least one entered
result.

- **Title probability over time** — a line per top team (`probs[code].W` at
  each timeline point) plus a "Field" line for everything else, with vertical
  markers for the end of the group stage and the start of each knockout
  round. Hover a point to see that day's results and each visible team's
  change since the previous point.
- **Match impact** — for each match day, the matches played and the biggest
  title-probability movers (the deltas behind the line chart above), newest
  first.
- **Stage distribution over time** — for a chosen team, the same exit-stage
  breakdown as the Progression chart above, but as a stacked area evolving
  across the timeline instead of frozen at "now".
- **Group qualification races** — per group, each of its four teams'
  probability of reaching the R32, through the end of the group stage.
  Best-third uncertainty can keep these moving even after a team's own group
  has finished, since it depends on how the *other* groups' third-placed
  teams compare.

**Run-count caveat**: timeline points use `HISTORY_RUNS = 5000` simulations
(vs `DEFAULT_RUNS = 15 000` for the live "Tournament outlook" table above), so the
timeline's most recent point can differ from that table by roughly a
percentage point — plenty of precision for a curve, but not identical.

**Caching**: each point is cached in the browser's `localStorage`, keyed by a
hash of its result subset, `HISTORY_RUNS`, the seed, and `ENGINE_VERSION`
(bumped whenever `engine.mjs`'s simulation logic changes, invalidating
previously-cached points). Only new or changed match days are recomputed, in
a dedicated Web Worker, so the timeline never blocks the rest of the UI.

### Per-match predictions ("Fixtures" panel)

For every match whose participants are already known, the app shows four
blocks derived analytically from the match model (not from MC sampling, so
they don't depend on N):

**Tendency** — the overall win/draw/loss probability for each side. Computed
as the sum of all scoreline probabilities in the home-win, draw, and away-win
cells of the score matrix respectively.

**Most likely score, by outcome** — for each of the three outcomes (home win,
draw, away win), the single most probable exact scoreline *within that outcome*,
with its conditional probability (e.g. "given a home win, 1:0 has a 34%
chance"). This is more informative than the single global most-likely score,
which in low-scoring Poisson-ish football is very often 1:1 or 0:0 even when
one side is a clear favourite — because one draw cell can be the single most
probable cell even when the total probability of all win cells is larger.

**Top 5 scorelines** — the five highest-probability individual scorelines in
absolute terms (unconditional), with each one's probability.

**Expected goals (xG)** — the raw λ_home : λ_away values from the Elo-to-lambda
conversion (see Match model below). This is the *expected number of goals per
side* under the Poisson model before the Dixon-Coles correction is applied.

### Knockout bracket

Slots for matches not yet played show a list of teams with their probability of
filling that slot. These are also MC counts: across all N runs, the engine
records which team filled each bracket slot, and divides by N. Since `RATING_SIGMA`
noise is applied per run, these reflect genuine uncertainty about who advances.
Once a match is played and its result entered, that slot collapses to ~100% for
the real participant in every subsequent run.

---

## Match model

### From Elo to goal expectation

Every team has an Elo rating (World Football Elo — see `data/teams.json`).
For a match between home team H and away team A:

```
sup   = (elo_H − elo_A + HOME_ADV) / ELO_PER_GOAL   ← goal supremacy
λ_H   = (BASE_TOTAL + sup) / 2                        ← home expected goals
λ_A   = (BASE_TOTAL − sup) / 2                        ← away expected goals
```

Both are clamped to a minimum of 0.12 so very lopsided Elo gaps don't produce
near-zero lambdas. `HOME_ADV = 0` because World Cup matches are at neutral
venues. Expected goals are symmetric: a 220-point Elo lead translates to
roughly one extra expected goal.

### Dixon-Coles score matrix

Goals are **not** treated as independent Poisson draws. Instead the engine
builds a full 11×11 scoreline matrix (0–10 goals per side) and applies the
Dixon-Coles correction to the four low-score cells:

```
P(h, a) ∝ Poisson(h | λ_H) × Poisson(a | λ_A) × τ(h, a)

τ(0,0) = 1 − λ_H · λ_A · ρ
τ(1,0) = 1 + λ_A · ρ
τ(0,1) = 1 + λ_H · ρ
τ(1,1) = 1 − ρ
τ(h,a) = 1   for all other (h,a)
```

With `RHO = −0.06` (negative), the correction slightly *decreases* the
probability of 0:0 and 1:1 draws and slightly *increases* 1:0 and 0:1. This
matches the empirical finding that low-score draws are somewhat less frequent
than independent Poisson predicts. The matrix is then renormalised to sum to 1.

A simulated match samples one (h, a) cell from this matrix using the CDF.

### Per-run Elo noise (RATING_SIGMA)

A pure Elo model is too confident about favourites: without uncertainty about
true team strength, the best-rated side accumulates small probability edges
over seven knockout games that compound into an unrealistically large title
probability. To counteract this, the engine draws a fresh random Elo offset
for every team at the start of each MC run:

```
elo_eff(team) = elo(team) + N(0, σ)    where σ = RATING_SIGMA = 100
```

The noise is drawn using a Box-Muller transform from the seeded RNG and is
applied consistently across both the group stage and all knockout matches in
that run. A σ of 100 Elo points represents "we don't know the true strength to
better than roughly ±100 points" — it fattens the tail of the title
distribution and regresses extreme favourites toward the field without changing
the average ranking. This knob was calibrated against bookmaker outright-winner
odds (see Calibration check below); σ=100 roughly halves the Spain/Argentina
over-confidence versus the market.

**This noise is never applied to `predictMatch` (the display function)** — xG
and tendency are computed from the real Elo values, not the per-run noisy ones.

### Knockout match resolution

An unplayed knockout match is resolved in sequence:

1. **90 minutes** — sample a scoreline from the score matrix.
2. **If level after 90 min: extra time** — sample a *second* scoreline from a
   matrix built with `λ × ET_FACTOR` (default ⅓ of a normal match). Add to
   the 90-min score.
3. **If still level: penalty shootout** — a near-coin-flip weighted by Elo:
   `p(home wins) = 1 / (1 + 10^(−ΔElo / 2000))`. This is the standard Elo
   win-probability formula applied to the shootout specifically.

For **played** knockout matches the entered score is used directly (not
re-sampled). If the score is level and a winner token is provided in
`results.json`, that token is authoritative. If the score is level and no
token is provided, the engine falls back to the penalty model — but you should
always add the token for real results (see `results.json` format below).

---

## Model parameters

All knobs live in `PARAMS` in `engine.mjs`. Change them there; the verifier
will catch if they break consistency.

| param | meaning | default |
|---|---|---|
| `BASE_TOTAL` | average total goals in an evenly matched game | 2.65 |
| `ELO_PER_GOAL` | Elo gap worth roughly 1 goal of supremacy | 220 |
| `HOME_ADV` | home-side Elo bonus (0 = neutral WC venues) | 0 |
| `RHO` | Dixon-Coles dependence; negative = slightly fewer 0:0/1:1 draws | −0.06 |
| `ET_FACTOR` | extra-time goal rate as a fraction of a full match | 1/3 |
| `RATING_SIGMA` | std-dev of per-team-per-run Elo noise (σ=0 disables) | 100 |

---

## Calibration check

Running `node verify.mjs` prints a side-by-side comparison of the model's
title probabilities against a captured snapshot of bookmaker outright-winner
odds (`data/odds.json`). The check converts American odds to
overround-free implied probabilities (divides each by their sum to strip the
bookmaker margin) so both sides sum to 1.0 before comparing.

Two summary statistics are reported:

- **Mean absolute difference (MAD)** — average |model% − market%| across the
  quoted teams. Lower is better; a few percentage points is normal.
- **Spearman rank correlation (ρ)** — agreement on *who is more likely than
  whom*. 1.0 = perfect rank agreement; the number itself matters more than
  the individual point gaps.

The snapshot captured 2026-06-07 (FanDuel, via Fox Sports — see
`data/odds.json`) with `RATING_SIGMA = 100` showed: Spearman ρ = 0.83, MAD =
2.1 percentage points. The largest remaining gaps were Spain (+5.5pp) and
Argentina (+6.2pp) rated higher than the market, and England (−5.2pp) and
France (−4.7pp) rated lower — likely because Elo and bookmaker prices weigh
different things (squad news, injury reports, historical pedigree, market
sentiment). This is a **plausibility signal, not a pass/fail gate** — both
the Elo feed and the bookmaker odds snapshot drift over time.

Re-run `node scripts/calibrate.mjs` after any Elo update to sweep
`RATING_SIGMA` and check whether the tuned value still minimises MAD.

---

## Engine API

```js
import { runMonteCarlo, predictMatch } from "./engine.mjs";

const { probs, predictions, slotAdvancement } = runMonteCarlo(data, results, N, seed);

// probs[teamCode] = { R32, R16, QF, SF, F, W }  — fraction of N runs where
//                   the team reached at least that stage (cumulative).

// predictions[]   — one entry per group match with known participants:
//                   { mostLikely, mostLikelyByOutcome, top5, tendency, expectedGoals }
//                   or { played: true, score: [h,a] } for entered results.

// slotAdvancement[slotId] — [{ code, prob }, …] sorted high→low: which teams
//                            filled that bracket slot, and how often.
```

`predictMatch(eloHome, eloAway)` — returns the descriptive prediction for one
fixture: most likely exact score, most-likely-by-outcome for each of the three
results, top 5 scorelines, W/D/L tendency, and expected goals. Uses the real
Elo values, not per-run noise.

---

## Repo layout

```
data/teams.json      48 teams: code, name, group, confed, elo (live ratings snapshot)
data/fixtures.json   72 group matches (real schedule) + full knockout structure
data/results.json    hand-edited played results: { matches: { "GE1": [3,0], ... } }
data/odds.json       dev-only snapshot: bookmaker odds for the calibration check
engine.mjs           simulation engine (no DOM) — runs in Node and browser
verify.mjs           Node script: runs MC, structural assertions, calibration check
scripts/calibrate.mjs  sweeps RATING_SIGMA to find the value that minimises MAD
```

---

## Run the verifier

```
node verify.mjs
```

The verifier runs the MC (40 000 simulations) and checks:

- Title probabilities sum to ~1.0; R32 probabilities sum to ~32 (one per advancing team); stage probs are monotone.
- **Annex C assertions** — exactly 495 rows, every row has 8 distinct A–L letters, the 495 rows cover all C(12,8) subsets exactly, no third-placed team is assigned to face its own group's winner.
- **Bracket tree assertions** — R32 has 16 matches, R16 has 8, QF 4, SF 2, Final 1; every slot in each stage is a `{w: id}` reference pointing to a valid match in the preceding stage.
- **results.json validation** — unknown match IDs, non-integer/negative scores, level knockout score with no winner token (error); knockout result entered before its feeder rounds are resolved (warning).
- **Calibration check** against bookmaker odds (self-skips if `data/odds.json` is absent).

---

## Adapting to the live tournament

`results.json` is the single source of truth. Each entry maps a match `id` to
`[homeGoals, awayGoals]`. Anything absent is simulated. The same engine code
runs pre-tournament (empty results) and at every later stage (more entries
fixed).

**Knockout matches decided on penalties** need the shootout winner as a third
element, since a knockout match must have a winner:

```json
"R32-1": [1, 1, "BRA"]   // 1-1 aet, Brazil won on penalties (team code)
"R16-3": [2, 2, "H"]     // or "H"/"A" for home/away side
"QF-2":  [2, 1]          // decisive score — no token needed
```

Entering a level score without a winner token is not a hard error — the engine
falls back to its penalty model — but it means the simulation is using a
probabilistic guess rather than the real outcome. The in-app validator will
flag it with an error banner.

To update during the tournament: edit `data/results.json`, commit, push.
The deployed app fetches the file (raw GitHub URL) and re-runs automatically.

---

## Start points & projections (UI)

Beyond simulating from the real entered results, the app can simulate forward
from a hypothetical "start point" where undecided matches are filled in with
the model's modal outcome (`pickMostLikelyScore` in `src/lib/selectors.js`:
argmax of tendency, then that outcome's most-likely conditional score).

- **Pre-tournament** — only real entered results are conditioned on; nothing synthesized.
- **After groups** — the 72 group matches are filled with modal outcomes; the knockout bracket shows advancement probabilities from the simulation.
- **After R32 / After R16 / After QF / After SF** — group matches filled, then knockout matches resolved and synthesized stage-by-stage up to and including that round; later rounds still show simulated probabilities.
- **Full tournament** — all 103 matches synthesized (group stage + all five knockout rounds, R32 through Final).

These are explicitly illustrative. Chaining the "most likely" pick in each
match compresses into one low-probability path through the bracket — not a
forecast of what will happen. The actual most-likely winner of the tournament
(as measured by the title probability) is often *not* the same team that the
deterministic most-likely-chain produces.

Synthesizing a complete bracket requires every tie to be broken — including
cross-group best-thirds ties. The real bracket view rightly refuses to call
those (a genuine undecided lots draw), but a projection has no "wait and see".
`buildKnockoutResolution` accepts a `{ tieBreakSeed }` that commits to a
single, reproducible draw of lots — all projected start points pass the same
`PROJECTION_TIE_BREAK_SEED` so the teams a synthesized score was computed for
are exactly the teams the bracket displays it between.

---

## Deployment (GitHub Pages)

Live at **https://manganite.github.io/wm2026/** — a static site, no backend.
`.github/workflows/deploy.yml` builds and deploys on every push to `main`.
The build step runs `scripts/sync-data.mjs` to copy `data/*.json` into
`public/data/` before the Vite build, so the browser-facing data files stay
in sync with the source of truth.

`vite.config.js` sets `base: '/wm2026/'` for the project-page URL structure;
keep that, the repo name, and `src/config.js`'s `GITHUB_OWNER`/`GITHUB_REPO`/
`RESULTS_RAW_URL` in sync if the repo ever moves.

The Monte-Carlo runs in a **Web Worker** (off the main thread), so the UI
stays responsive while the simulation churns. The raw-GitHub `results.json`
fetch is cache-busted with `?t=Date.now()` to bypass the browser cache, but
GitHub's CDN can still lag a few minutes behind a push — not a bug.

---

## Fidelity to FIFA's official rules

Four areas that could easily have been left as simplifying stand-ins were
instead matched to the official 2026 regulations:

- **Best-thirds assignment** uses FIFA's official Annex C lookup table verbatim
  (495 rows — one per possible combination of which 8 of the 12 groups produce
  a qualifying third-placed team), extracted from the WC 26 Regulations and
  verified for full, gap-free coverage of all C(12,8) combinations — see
  `thirdPlaceAssignments.mjs`.

- **Elo values** are live World Football Elo ratings pulled from eloratings.net
  (captured 2026-06-08 — see the `_comment` in `data/teams.json`). Ratings
  drift after every match, so re-capture before relying on them for a date far
  from the recorded snapshot.

- **R16+ bracket adjacency** mirrors FIFA's official knockout schedule
  (Match 73–104: R32 = 73–88, R16 = 89–96, QF = 97–100, SF = 101–102,
  Final = 104) verbatim — see the `_comment` in `data/fixtures.json`.

- **Group tiebreakers** follow Article 13 of the 2026 regulations: points,
  then head-to-head mini-league (points/GD/GF from mutual matches, recursively
  re-applied to still-tied subsets), then overall GD, overall GF. The two
  remaining criteria — fair-play score and FIFA World Ranking — fold into a
  random draw: this goals-only model has no card data to compute the former,
  and Elo is not a substitute for the latter. The draw is an unbiased
  resolution of a tie the model genuinely has no signal on. `pickBestThirds`
  mirrors the same logic for the best-thirds chain.

---

## References

**Match model**

1. Dixon, M.J. and Coles, S.G. (1997). "Modelling Association Football Scores
   and Inefficiencies in the Football Betting Market." *Journal of the Royal
   Statistical Society: Series C (Applied Statistics)*, 46(3), pp. 375–386.
   DOI: [10.1111/1467-9876.00065](https://doi.org/10.1111/1467-9876.00065)
   — the source of the Dixon-Coles τ correction applied to 0:0, 1:0, 0:1,
   1:1 scorelines; also introduces the independent-Poisson baseline this
   model extends.

2. Maher, M.J. (1982). "Modelling Association Football Scores." *Statistica
   Neerlandica*, 36(3), pp. 109–118.
   DOI: [10.1111/j.1467-9574.1982.tb00782.x](https://doi.org/10.1111/j.1467-9574.1982.tb00782.x)
   — the original independent-Poisson goal model that Dixon-Coles extends.

**Elo ratings**

3. World Football Elo Ratings — [eloratings.net](https://www.eloratings.net).
   Source of all team ratings used in this simulation (snapshot captured
   2026-06-08, see `data/teams.json`). The site documents its update formula
   and K-factor choices; the penalty-shootout win probability used here
   (`p = 1 / (1 + 10^(−ΔElo/2000))`) is the standard Elo formula with
   the same 2000-point scale factor eloratings.net applies to football.

**Tournament rules**

4. *FIFA World Cup 26™ Regulations* (2024). Fédération Internationale de
   Football Association. Available at
   [fifa.com](https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicous2026).
   — Article 13 (group-stage tiebreakers), Annex C (best-thirds assignment
   table), and Matches 73–104 (official knockout bracket adjacency) are all
   implemented verbatim in this simulation.

**Bookmaker odds (calibration snapshot)**

5. FanDuel Sportsbook outright-winner odds for the 2026 FIFA World Cup, as
   reported by Fox Sports, captured 2026-06-07. Used only as a
   plausibility check in `verify.mjs`; see `data/odds.json` for the full
   snapshot and conversion methodology.

**Inspiration**

6. [Monte-Carlo-Simulation-Chess-Candidates-2026](https://github.com/Periculum/Monte-Carlo-Simulation-Chess-Candidates-2026)
   — a Monte-Carlo simulation of the 2026 Chess Candidates Tournament, and
   the inspiration for this project.
