// "Start-point" projections: hypothetical results objects used to ask "what
// would the outlook look like if undecided matches went the way the model
// currently considers most likely?". Explicitly illustrative — real
// tournaments are not decided by modal scorelines — and labelled as such in
// the UI.
//
// `groupPredictions` should be the `predictions` array from a pre-tournament
// run of runMonteCarlo (or equivalently `predictKnownMatches` with empty
// results) — we reuse its analytic mostLikely scores rather than recomputing.
import { predictMatch } from "../../engine.mjs";
import { buildKnockoutResolution } from "./bracket.js";

const HOME_OUTCOMES = ["homeWin", "draw", "awayWin"];
const DECISIVE_OUTCOMES = ["homeWin", "awayWin"];

// Picks one scoreline out of a `predictMatch` result by the same two-step rule
// throughout this module: take the *tendency*'s argmax outcome (W/D/L), then
// that outcome's most-likely conditional score (`mostLikelyByOutcome`) — the
// combination that fixed the "1:1 everywhere" over-projection in match
// predictions (see MatchPrediction's "Most likely score, by outcome").
//
// `allowDraw: false` (knockout matches — a winner is mandatory) restricts the
// outcome choice to home/away win. That's not just "ignore the draw bucket":
// `mostLikelyByOutcome.homeWin`/`.awayWin` are, by construction, the argmax
// cells with h>a / h<a respectively, so the resulting score is *always*
// decisive — no shootout-token synthesis is ever needed here.
function pickMostLikelyScore(prediction, { allowDraw }) {
  const { tendency, mostLikelyByOutcome } = prediction;
  const keys = allowDraw ? HOME_OUTCOMES : DECISIVE_OUTCOMES;
  const outcome = keys.reduce((best, k) => (tendency[k] > tendency[best] ? k : best), keys[0]);
  return mostLikelyByOutcome[outcome].score;
}

export function synthesizeGroupStageResults(baseResults, groupPredictions) {
  const matches = { ...baseResults.matches };
  for (const p of groupPredictions) {
    if (matches[p.id] || p.played) continue; // real results always take precedence
    matches[p.id] = pickMostLikelyScore(p.prediction, { allowDraw: true });
  }
  return { ...baseResults, matches };
}

// Projects the *entire* tournament: group matches from the precomputed
// pre-tournament baseline, then knockout matches stage-by-stage as their
// participants become concretely known. Each newly-resolvable match's score
// is synthesized the same way (tendency -> outcome-conditional score) and fed
// back in, so the next pass can resolve whatever it unlocks — propagating
// forward through R32 -> R16 -> QF -> SF -> F.
//
// Reuses buildKnockoutResolution (the exact standings/best-thirds/Annex-C/
// adjacency logic the real bracket view runs on real results) to discover,
// after each pass, which matches now have both sides fixed — never
// reimplements that resolution logic, so it can't drift from it.
//
// One wrinkle that's specific to *this* projection: filling every group match
// with its single modal score tends to produce several third-placed teams
// with near-identical records (same points, same goal difference, same goals
// for) — genuine cross-group ties that the real bracket view rightly refuses
// to call (see resolveGroupStandings's double-seed agreement gate: a real,
// undecided lots draw is "not concretely known yet"). But a *projection* has
// no "wait and see" — every match needs a score, ties included — and resolving
// one via a single, fixed, reproducible draw of lots is no less legitimate a
// modelling choice than picking a match's modal scoreline (the engine already
// treats lots-drawing as an explicit randomized procedure; see `rng` in
// simulateGroup/pickBestThirds). So this is the one place that passes a fixed
// `tieBreakSeed`, committing to one coherent draw throughout — without it, the
// projection would silently stall right at the Best-3rd R32 matches forever.
//
// Like the group-only projection above, this is purely illustrative: chaining
// "most likely" picks through six rounds compounds to a single path with a
// low *joint* probability — labelled as such in the UI (see App's "Start
// point" caption), never presented as a forecast.
// Exported so App.jsx can re-derive `knockoutResolution` for the projected
// `simResults` with the *same* seed — `buildKnockoutResolution` is otherwise
// pure/deterministic in its inputs (including the seed), so calling it again
// with this constant on the same synthetic results reproduces the identical
// resolution this function used internally to pick each match's participants.
// Keeping that one source of truth is what stops the bracket UI from showing
// a synthesized score next to a still-generic "Best 3rd (...)" label.
export const PROJECTION_TIE_BREAK_SEED = 1;

const KNOCKOUT_STAGE_ORDER = ["R32", "R16", "QF", "SF", "F"];

// `stopAfterStage` (default "F") limits how far the knockout projection
// propagates — passing "R32" fills only R32 matches, "R16" fills R32+R16, etc.
// Used to synthesize the "After R32", "After R16", etc. start points.
export function synthesizeFullTournamentResults(
  data,
  baseResults,
  baseline,
  ctx,
  params,
  { stopAfterStage = "F" } = {}
) {
  const stopIdx = KNOCKOUT_STAGE_ORDER.indexOf(stopAfterStage);
  const allowedStages = new Set(KNOCKOUT_STAGE_ORDER.slice(0, stopIdx + 1));

  const matches = { ...baseResults.matches };
  for (const p of baseline) {
    if (matches[p.id] || p.played) continue;
    matches[p.id] = pickMostLikelyScore(p.prediction, { allowDraw: true });
  }

  let synthetic = { ...baseResults, matches };
  const MAX_PASSES = 8; // 1 group pass + R32/R16/QF/SF/F, plus headroom
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const resolution = buildKnockoutResolution(data, synthetic, { tieBreakSeed: PROJECTION_TIE_BREAK_SEED });
    const additions = {};
    for (const m of data.fixtures.knockout) {
      if (synthetic.matches[m.id]) continue;
      if (!allowedStages.has(m.stage)) continue;
      const slot = resolution.get(m.id);
      if (!slot?.bothKnown) continue;
      const prediction = predictMatch(ctx.eloOf[slot.home], ctx.eloOf[slot.away], params);
      additions[m.id] = pickMostLikelyScore(prediction, { allowDraw: false });
    }
    if (Object.keys(additions).length === 0) break;
    synthetic = { ...synthetic, matches: { ...synthetic.matches, ...additions } };
  }
  return synthetic;
}

export const START_POINTS = [
  { id: "pretournament", label: "Pre-tournament" },
  { id: "afterGroups", label: "After groups", projected: true },
  { id: "afterR32", label: "After R32", projected: true },
  { id: "afterR16", label: "After R16", projected: true },
  { id: "afterQF", label: "After QF", projected: true },
  { id: "afterSF", label: "After SF", projected: true },
  { id: "fullProjection", label: "Full tournament", projected: true },
];
