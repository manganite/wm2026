// Running accuracy readout: Brier score and log-loss comparing the model's
// PRE-MATCH tendency predictions against the results entered so far — a
// visible "track record" for the model.
//
// Group matches are scored against a pre-tournament BASELINE prediction, not
// the live, continuously-conditioned one (which already incorporates the very
// result being scored — comparing against it would be circular). The baseline
// is exact and cheap: predictKnownMatches is analytic (Elo -> Poisson/DC),
// independent of N and the Monte-Carlo sampling loop.
//
// Knockout matches are scored on demand via predictMatch(eloHome, eloAway):
// once a knockout match has been played, its participants are retroactively
// known, so its pre-match Elo-based tendency is unambiguous to compute.
import { buildContext, predictKnownMatches, predictMatch, eloToLambdas, buildScoreMatrix, PARAMS } from "../../engine.mjs";

export const OUTCOMES = ["homeWin", "draw", "awayWin"];
const EMPTY_RESULTS = { matches: {} };

export function outcomeOf(homeGoals, awayGoals) {
  if (homeGoals > awayGoals) return "homeWin";
  if (homeGoals < awayGoals) return "awayWin";
  return "draw";
}

// Multi-class Brier score: mean squared error between the predicted
// distribution and the one-hot actual outcome, summed across all 3 categories.
export function brierTerm(tendency, actual) {
  let sum = 0;
  for (const outcome of OUTCOMES) {
    const target = outcome === actual ? 1 : 0;
    sum += (tendency[outcome] - target) ** 2;
  }
  return sum;
}

export function logLossTerm(tendency, actual) {
  return -Math.log(Math.max(tendency[actual], 1e-9));
}

// `knockoutResolution` is the Map from buildKnockoutResolution — used to look
// up a played knockout match's participants (retroactively known once played).
export function computeAccuracy(data, results, knockoutResolution) {
  const ctx = buildContext(data, EMPTY_RESULTS, PARAMS);
  const baseline = predictKnownMatches(data, EMPTY_RESULTS, ctx, PARAMS);

  let brierSum = 0;
  let logLossSum = 0;
  let n = 0;

  const score = (tendency, [homeGoals, awayGoals]) => {
    const actual = outcomeOf(homeGoals, awayGoals);
    brierSum += brierTerm(tendency, actual);
    logLossSum += logLossTerm(tendency, actual);
    n++;
  };

  for (const b of baseline) {
    const played = results.matches[b.id];
    if (played) score(b.prediction.tendency, played);
  }

  for (const m of data.fixtures.knockout) {
    const played = results.matches[m.id];
    if (!played) continue;
    const slot = knockoutResolution.get(m.id);
    if (!slot?.bothKnown) continue;
    const { tendency } = predictMatch(ctx.eloOf[slot.home], ctx.eloOf[slot.away], PARAMS);
    score(tendency, played);
  }

  if (n === 0) return null;
  return { brier: brierSum / n, logLoss: logLossSum / n, n };
}

// Per-match evaluation rows for the scorecard, calibration diagram, and
// accuracy-over-time views. Same scoring convention as computeAccuracy:
// group matches against the pre-tournament baseline, knockout matches via
// retroactive predictMatch once participants are known.
export function computeMatchDetails(data, results, knockoutResolution) {
  const ctx = buildContext(data, EMPTY_RESULTS, PARAMS);
  const baseline = predictKnownMatches(data, EMPTY_RESULTS, ctx, PARAMS);

  const fixtureDateMap = new Map();
  for (const f of data.fixtures.groupStage) fixtureDateMap.set(f.id, f.date);
  for (const f of data.fixtures.knockout) fixtureDateMap.set(f.id, f.date);

  const rows = [];

  const addRow = (id, stage, group, homeCode, awayCode, played) => {
    const [homeGoals, awayGoals] = played;
    const actual = outcomeOf(homeGoals, awayGoals);
    const pred = predictMatch(ctx.eloOf[homeCode], ctx.eloOf[awayCode], PARAMS);
    const { lamH, lamA } = eloToLambdas(ctx.eloOf[homeCode], ctx.eloOf[awayCode], PARAMS);
    const sm = buildScoreMatrix(lamH, lamA, PARAMS);
    const pScore = Math.max(sm.M[homeGoals]?.[awayGoals] ?? 1e-9, 1e-9);
    const pOutcome = Math.max(pred.tendency[actual], 1e-9);
    const argmax = pred.tendency.homeWin >= pred.tendency.draw && pred.tendency.homeWin >= pred.tendency.awayWin
      ? "homeWin"
      : pred.tendency.awayWin >= pred.tendency.draw
        ? "awayWin"
        : "draw";
    rows.push({
      id, stage, group, home: homeCode, away: awayCode,
      actualScore: [homeGoals, awayGoals],
      actualOutcome: actual,
      tendency: pred.tendency,
      mostLikelyScore: pred.mostLikely,
      pResult: pScore,
      pOutcome: pOutcome,
      surprisalBits: -Math.log2(pOutcome),
      correctTendency: argmax === actual,
      date: fixtureDateMap.get(id),
      lamHome: lamH,
      lamAway: lamA,
      xPtsHome: 3 * pred.tendency.homeWin + pred.tendency.draw,
      xPtsAway: 3 * pred.tendency.awayWin + pred.tendency.draw,
    });
  };

  for (const b of baseline) {
    const played = results.matches[b.id];
    if (!played) continue;
    addRow(b.id, "group", b.group, b.home, b.away, played);
  }

  for (const m of data.fixtures.knockout) {
    const played = results.matches[m.id];
    if (!played) continue;
    const slot = knockoutResolution.get(m.id);
    if (!slot?.bothKnown) continue;
    addRow(m.id, m.stage, null, slot.home, slot.away, played);
  }

  return rows;
}
