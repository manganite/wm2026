// Each segment = "probability this team's run ends at exactly this stage"
// (i.e. the drop-off between consecutive cumulative reach-probabilities).
// Stacking them turns the engine's cumulative `probs[code]` tally into a
// single distribution-over-final-stage — "how far are they likely to go".
// Shared by ProgressionChart (a snapshot bar per team, "now") and
// StageDistributionChart (a stacked area for one team, over the timeline).
export const SEGMENTS = [
  { key: "out", label: "Out in groups", color: "#cfcfd6", from: null, to: "R32" },
  { key: "R32", label: "Lost in R32", color: "#9aa7c7", from: "R32", to: "R16" },
  { key: "R16", label: "Lost in R16", color: "#7e93c9", from: "R16", to: "QF" },
  { key: "QF", label: "Lost in QF", color: "#6f7fd1", from: "QF", to: "SF" },
  { key: "SF", label: "Lost in SF", color: "#5f6bd6", from: "SF", to: "F" },
  { key: "F", label: "Runner-up", color: "#4f56d6", from: "F", to: "W" },
  { key: "W", label: "Champion", color: "#caa400", from: "W", to: null },
];

export function segmentsFor(p) {
  return SEGMENTS.map((s) => {
    const upper = s.from ? p[s.from] : 1;
    const lower = s.to ? p[s.to] : 0;
    return { ...s, value: Math.max(0, upper - lower) };
  });
}
