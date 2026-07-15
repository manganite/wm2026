// Shared team ordering for the views that rank teams by probability — the
// outlook table, the progression chart, and the placings chart.
//
// The subtlety is the tie, not the sort. Ranking by title probability alone
// leaves every team that can't win level on 0, and `Array.sort` is stable, so
// they'd keep teams.json's order — which is group A→L. That puts a beaten
// semi-finalist below a team that went out in the group stage, and makes the
// progression chart's "top 12" a list of whoever happens to be in groups A
// and B.
//
// So a tie cascades down the stage ladder, deepest first: level on the title,
// rank by reaching the Final; still level, by the semi-final; and so on. That
// makes the default order read as "how far did each team go", which is what
// the tail of the table is actually showing.
const DEPTH_KEYS = ["W", "F", "SF", "QF", "R16", "R32"];

// `key` is the clicked column and stays primary; `dir` is -1 for descending.
// The cascade follows `dir` too, so an ascending sort is a true reverse
// ranking (least likely, then least far) rather than a descending one with an
// inconsistent tail. Team name last, so the order is total — never dependent
// on the input array, which is what made this dependent on group order.
export function compareTeams(a, b, probs, key, dir) {
  const pa = probs[a.code];
  const pb = probs[b.code];

  const primary = dir * (pa[key] - pb[key]);
  if (primary !== 0) return primary;

  for (const k of DEPTH_KEYS) {
    if (k === key) continue; // already applied as the primary
    const d = dir * (pa[k] - pb[k]);
    if (d !== 0) return d;
  }

  return a.name.localeCompare(b.name);
}

// Convenience for the charts, which always rank by title probability.
export function byTitleThenDepth(probs) {
  return (a, b) => compareTeams(a, b, probs, "W", -1);
}
