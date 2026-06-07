// "Start-point" projections: hypothetical results objects used to ask "what
// would the outlook look like if the remaining group games went the way the
// model currently considers most likely?". Explicitly illustrative — real
// tournaments are not decided by modal scorelines — and labelled as such in
// the UI. v1 supports the group stage only (see CLAUDE_CODE_BRIEF's
// "live-tournament affordances"; deeper knockout projection is a documented
// follow-up, since it would require propagating synthetic results stage by
// stage through the bracket).
//
// `groupPredictions` should be the `predictions` array from a pre-tournament
// run of runMonteCarlo (or equivalently `predictKnownMatches` with empty
// results) — we reuse its analytic mostLikely scores rather than recomputing.
export function synthesizeGroupStageResults(baseResults, groupPredictions) {
  const matches = { ...baseResults.matches };
  for (const p of groupPredictions) {
    if (matches[p.id] || p.played) continue; // real results always take precedence
    matches[p.id] = p.prediction.mostLikely.score;
  }
  return { ...baseResults, matches };
}

export const START_POINTS = [
  { id: "pretournament", label: "Pre-tournament" },
  { id: "groups", label: "After group stage (projected)" },
];
