/**
 * Validates a results object against the known fixtures.
 * Returns { errors: string[], warnings: string[] }.
 *
 * Designed to run in both the browser (imported by useTournamentData) and Node
 * (imported by verify.mjs), so it uses no browser or Node-specific APIs.
 */
export function validateResults(results, fixtures) {
  const errors = [];
  const warnings = [];

  const allFixtureIds = new Set([
    ...fixtures.groupStage.map((m) => m.id),
    ...fixtures.knockout.map((m) => m.id),
  ]);

  const knockoutById = new Map(fixtures.knockout.map((m) => [m.id, m]));
  const koResultIds = new Set();

  for (const [id, val] of Object.entries(results.matches ?? {})) {
    // Unknown ID
    if (!allFixtureIds.has(id)) {
      errors.push(`Unknown match ID "${id}" — not in fixtures.json (typo?)`);
      continue;
    }

    const [h, a, tok] = Array.isArray(val) ? val : [];

    // Non-integer / negative scores
    if (!Number.isInteger(h) || h < 0 || !Number.isInteger(a) || a < 0) {
      errors.push(`Match ${id}: scores must be non-negative integers, got ${JSON.stringify(val)}`);
      continue;
    }

    // Level knockout score with no winner token
    if (knockoutById.has(id) && h === a && !tok) {
      errors.push(`Match ${id}: knockout match ended ${h}:${a} — missing shootout/ET winner token (add a third element like "HOME" or "AWAY")`);
    }

    if (knockoutById.has(id)) koResultIds.add(id);
  }

  // KO result entered before its feeder matches are played
  // Build a map from result ID -> set of feeder IDs that must be played first.
  // A feeder is "played" if results.matches has a valid entry for it OR if it
  // feeds from group stage (those slots don't have {w:...} refs).
  function feedersOf(koMatch) {
    const feeders = [];
    for (const side of ["home", "away"]) {
      const slot = koMatch[side];
      if (slot?.w) feeders.push(slot.w);
    }
    return feeders;
  }

  for (const id of koResultIds) {
    const match = knockoutById.get(id);
    const feeders = feedersOf(match);
    const unplayed = feeders.filter((fid) => !koResultIds.has(fid));
    if (unplayed.length > 0) {
      warnings.push(
        `Match ${id}: result entered but feeder match(es) ${unplayed.join(", ")} have no result yet — enter results in round order to avoid mismatched team assignments`
      );
    }
  }

  return { errors, warnings };
}
