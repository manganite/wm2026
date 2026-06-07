# Build Brief — WC 2026 Simulation web app

You are extending an existing project. A **verified simulation engine and data
files already exist** — do not rewrite them. Your job is to build the **English
React UI** around the engine and set up **GitHub Pages deployment**.

## What already exists (treat as the source of truth)

```
engine.mjs           Verified Monte-Carlo engine. DO NOT modify its logic.
data/teams.json      48 teams (code, name, group, confed, elo)
data/fixtures.json   72 group matches + full knockout structure
data/results.json    hand-edited played results (single source of truth)
verify.mjs           Node sanity checker (keep it working)
README.md            Schema + engine API + caveats. Read it first.
```

Read `README.md` and skim `engine.mjs` before writing anything.

## Engine API you must consume

```js
import { runMonteCarlo, predictMatch } from "./engine.mjs";

const { probs, predictions } = runMonteCarlo(data, results, N, seed);
//  data        = { teams: <teams.json>, fixtures: <fixtures.json> }
//  results     = <results.json>
//  probs[code] = { R32, R16, QF, SF, F, W }   (each a probability 0..1)
//  predictions = per group match:
//      { id, stage, group, home, away, played:false,
//        prediction: { mostLikely:{score,prob}, top3:[...], tendency:{homeWin,draw,awayWin}, expectedGoals:[lamH,lamA] } }
//      or { ..., played:true, score:[h,a] }
```

Do not re-implement any of this. Call it.

## Hard constraints

1. **Static site only** — must run fully client-side and deploy to GitHub Pages.
   No backend, no server code, no secrets.
2. **UI language: English.**
3. **Do not change `engine.mjs` logic.** If you need a new selector, add a thin
   wrapper, don't touch the core.
4. **`results.json` is the only place results live.** The app reads it; it never
   writes tournament results into code.
5. Keep `verify.mjs` runnable (`node verify.mjs` must still pass: title probs
   sum ~1.0, R32 probs sum ~32, stage probs monotone).

## Tech stack

- **Vite + React.** Plain CSS or a lightweight styling approach — clean and
  legible, no heavy UI framework needed.
- For a **project page** the site is served at `/<repo>/`, so set Vite
  `base: '/<repo>/'`.
- **Run the Monte-Carlo in a Web Worker** (module worker) so the UI stays
  responsive. Show a progress/loading state while it runs.
- Default `N ≈ 15000` runs with a control to raise it. (~40k runs ≈ several
  seconds; pick a default that feels instant-ish, let power users increase it.)
- **GitHub Actions workflow** (`.github/workflows/deploy.yml`) that builds and
  deploys to Pages on push. Use the built-in `GITHUB_TOKEN`; no extra secrets.

## Data loading

- Fetch `teams.json` and `fixtures.json` from the bundled site.
- Fetch `results.json` so that a **hand-edit + commit updates the live site
  without rebuilding the app**. Prefer the raw GitHub URL
  (`https://raw.githubusercontent.com/<user>/<repo>/main/data/results.json`)
  with a cache-busting query param; fall back to the bundled copy if the fetch
  fails. Make the URL a single config constant at the top.
- Re-run the simulation whenever the loaded results change.

## UI requirements

### 1. Tournament outlook
- **Title probability table**, sortable, all 48 teams, columns: reach R16, QF,
  SF, Final, Win title (as %).
- A **stacked progression chart** of how far each (top-N) team is likely to go.

### 2. Fixtures panel (group + knockout)
- List every fixture grouped by stage/group. For each:
  - **Played** matches show the actual score (and shootout winner if present).
  - **Not-yet-played** matches show the **prediction**.
- Played matches must be visually marked as **fixed** (e.g. a lock/checkmark),
  making clear they are conditioned on, not simulated.

### 3. Match prediction display (important nuance)
For an unplayed match show, side by side:
- **Most-likely exact score** *with its probability* (it will often be only
  ~10–20% — show the number so it isn't mistaken for certainty).
- **Top-3 scorelines** with probabilities.
- **Tendency**: home win / draw / away win as %.
- **Expected goals** (xG) `lamH : lamA`.

The most-likely score and the tendency can disagree (e.g. most-likely **1:1**
while the favourite still has the higher win probability). **Show both** and do
not collapse them into one "predicted result". Never imply the whole tournament
was computed from these single scores — advancement/title numbers come from the
full distribution over all runs.

### 4. Knockout bracket
- Render the bracket. Slots fill in as results are entered; unfilled slots show
  the advancement probabilities feeding them.
- Knockout match predictions appear once **both participants are fixed** by
  entered results; before that, show the probabilistic picture, not a fake score.

### 5. Live-tournament affordances
- A **"now" marker** in the progression view: past = actual, future = projected.
- A **running accuracy readout** (Brier score / log-loss) comparing pre-match
  predictions against entered results, so the model's track record is visible.
- A **start-point selector**: simulate from pre-tournament / after group stage /
  after R16, etc. (Mechanically this is just "condition on results up to point X.")

## Out of scope (leave as documented caveats)

Do not try to "fix" these — they are deliberate and noted in `README.md`:
- Approximate Elo seed values.
- Best-thirds assignment via bipartite matching (not FIFA's exact lookup table).
- R16+ bracket adjacency as a clean stand-in.

If you want, expose the calibration knobs (`PARAMS` in `engine.mjs`) read-only
in an "advanced" panel, but keep their defaults.

## Acceptance criteria

- `npm run dev` runs the app; `npm run build` produces a Pages-ready `dist/`.
- Pushing to the default branch deploys a working site via Actions.
- With empty `results.json` the title table shows Spain/Argentina/France/England/
  Brazil on top and sums to ~100%.
- Editing `data/results.json` (e.g. `"GE1": [3,0]`) and reloading visibly shifts
  the probabilities and marks GE1 as played.
- A penalty result like `"R32-1": [1,1,"BRA"]` is handled (Brazil advances).
- The simulation runs off the main thread; the UI never freezes.
- `node verify.mjs` still passes.

## Suggested first steps

1. `npm create vite@latest` (React), wire up `base`, add the three JSON files
   under `public/data/` (or fetch as described).
2. Worker that imports `engine.mjs` and runs `runMonteCarlo`.
3. Build the outlook table, then the fixtures panel + prediction display, then
   the bracket, then the live affordances.
4. Add the Actions deploy workflow and verify the published page.
