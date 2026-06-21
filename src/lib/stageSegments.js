// Each segment = "probability this team's run ends at exactly this stage"
// (i.e. the drop-off between consecutive cumulative reach-probabilities).
// Stacking them turns the engine's cumulative `probs[code]` tally into a
// single distribution-over-final-stage — "how far are they likely to go".
// Shared by ProgressionChart (a snapshot bar per team, "now") and
// StageDistributionChart (a stacked area for one team, over the timeline).
export const SEGMENTS = [
  { key: "out", label: "Out in groups", color: "#9e9eab", from: null, to: "R32" },
  { key: "R32", label: "Lost in R32", color: "#5d9dd5", from: "R32", to: "R16" },
  { key: "R16", label: "Lost in R16", color: "#4478c2", from: "R16", to: "QF" },
  { key: "QF", label: "Lost in QF", color: "#8b5dbf", from: "QF", to: "SF" },
  { key: "SF", label: "Lost in SF", color: "#c95f7b", from: "SF", to: "F" },
  { key: "F", label: "Runner-up", color: "#e08a3c", from: "F", to: "W" },
  { key: "W", label: "Champion", color: "#caa400", from: "W", to: null },
];

export function segmentsFor(p) {
  return SEGMENTS.map((s) => {
    const upper = s.from ? p[s.from] : 1;
    const lower = s.to ? p[s.to] : 0;
    return { ...s, value: Math.max(0, upper - lower) };
  });
}
