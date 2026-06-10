// Pure helpers for the Timeline view (probability-over-time charts).
//
// The whole feature rests on one idea: no snapshot storage is needed. For a
// timeline point T, take the subset of results.json entries whose fixture
// date is <= T and re-run the engine conditioned on that subset — the seeded
// RNG makes it reproducible, so every point is recomputable on demand from
// fixtures.json (dates) + results.json (scores) alone.

// Sentinel for the pre-tournament anchor point (empty conditioning). Sorts
// before every ISO date by construction (callers must not rely on string
// comparison alone — see compareTimelineDates).
export const T0 = "t0";

function allFixtures(fixtures) {
  return [...fixtures.groupStage, ...fixtures.knockout];
}

// Map<fixtureId, isoDate>, built once from groupStage + knockout.
export function buildFixtureDateMap(fixtures) {
  const map = new Map();
  for (const f of allFixtures(fixtures)) map.set(f.id, f.date);
  return map;
}

// Subsets results.matches to entries whose fixture date is <= isoDate.
export function resultsUpTo(results, fixtures, isoDate) {
  const dateMap = buildFixtureDateMap(fixtures);
  const matches = {};
  for (const [id, val] of Object.entries(results.matches)) {
    const date = dateMap.get(id);
    if (date && date <= isoDate) matches[id] = val;
  }
  return { matches };
}

// Timeline points = t0 (pre-tournament prior) + one point per date that has
// at least one entered result. Dates with no results yet contribute no
// point, so the newest point always equals the current full conditioning.
export function timelinePoints(results, fixtures) {
  const dateMap = buildFixtureDateMap(fixtures);
  const dates = new Set();
  for (const id of Object.keys(results.matches)) {
    const date = dateMap.get(id);
    if (date) dates.add(date);
  }
  return [T0, ...[...dates].sort()];
}

// Total order over timeline point identifiers (t0 first, then ISO dates
// chronologically) — t0's "t0" string would otherwise sort after dates.
export function compareTimelineDates(a, b) {
  if (a === b) return 0;
  if (a === T0) return -1;
  if (b === T0) return 1;
  return a < b ? -1 : 1;
}

// Fixtures scheduled on isoDate that already have an entered result —
// "what happened on this date" for hover tooltips and the match-impact panel.
export function matchesOnDate(fixtures, results, isoDate) {
  return allFixtures(fixtures)
    .filter((f) => f.date === isoDate && results.matches[f.id])
    .map((f) => ({ ...f, result: results.matches[f.id] }));
}

// Min/max fixture dates per stage, for the timeline's vertical stage-boundary
// markers (end of groups, start of R32/R16/QF/SF/F).
export function stageBoundaries(fixtures) {
  const min = (arr) => arr.reduce((a, b) => (a < b ? a : b));
  const max = (arr) => arr.reduce((a, b) => (a > b ? a : b));

  const byStage = {};
  for (const f of fixtures.knockout) (byStage[f.stage] ??= []).push(f.date);

  return {
    groupsStart: min(fixtures.groupStage.map((f) => f.date)),
    groupsEnd: max(fixtures.groupStage.map((f) => f.date)),
    R32: min(byStage.R32),
    R16: min(byStage.R16),
    QF: min(byStage.QF),
    SF: min(byStage.SF),
    F: min(byStage.F),
  };
}
