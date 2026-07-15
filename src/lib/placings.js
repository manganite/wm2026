// Each segment = "probability this team finishes in exactly this position".
// FIFA awards four final placings: the Final decides 1st/2nd, the third-place
// play-off decides 3rd/4th. Every other team's tournament has no official
// placing, so this is a distribution over the top four only — unlike
// stageSegments.js, these do NOT sum to 1 per team. They sum to the team's
// P(reach SF), which is exactly "the chance of finishing in the top four".
//
// Nothing new is simulated for this: all four positions are already implied,
// exactly, by the engine's existing tally.
//
//   1st = W                  won the Final
//   2nd = F − W              reached the Final, lost it
//   3rd = P3                 won the third-place play-off
//   4th = (SF − F) − P3      lost the SF, then lost the play-off
//
// These are exact rather than approximate, because each is a strict per-run
// subset of the one it's subtracted from: a run that won bronze is a run that
// reached the SF and did not reach the Final. So 4th can never go negative,
// no matter the Monte-Carlo noise, and every column sums to ~1.0 across all
// 48 teams (exactly one team finishes 1st, one 2nd, one 3rd, one 4th).
//
// Colours: 1st and 2nd are deliberately the same gold/orange that
// stageSegments.js gives "Champion" and "Runner-up" — the same entity keeps
// its colour across both charts. 3rd adds a bronze; 4th is the palette's
// neutral, staying recessive because "fourth" is the one top-four finish with
// nothing to show for it.
export const PLACINGS = [
  { key: "first", label: "1st", color: "#caa400" },
  { key: "second", label: "2nd", color: "#e08a3c" },
  { key: "third", label: "3rd", color: "#b06a4a" },
  { key: "fourth", label: "4th", color: "#9e9eab" },
];

export function placingsFor(p) {
  const values = {
    first: p.W,
    second: p.F - p.W,
    third: p.P3,
    fourth: p.SF - p.F - p.P3,
  };
  // Math.max guards only against float dust (e.g. 0.3 - 0.1 - 0.2 < 0), not
  // against a real negative — see the exactness note above.
  return PLACINGS.map((s) => ({ ...s, value: Math.max(0, values[s.key]) }));
}

// P(finishes in the top four) = P(reaches the SF). Used to rank and filter the
// chart: a team that can't reach the SF has no placing to show.
export function topFourProb(p) {
  return p.SF;
}
