import { simulateGroup, makeRng } from "../../engine.mjs";
import { PROJECTION_TIE_BREAK_SEED } from "./selectors.js";

function computeWDL(code, groupMatches, results) {
  let w = 0, d = 0, l = 0;
  for (const m of groupMatches) {
    const r = results.matches[m.id];
    if (!r) continue;
    const [hg, ag] = r;
    if (m.home === code) {
      if (hg > ag) w++; else if (hg === ag) d++; else l++;
    } else if (m.away === code) {
      if (ag > hg) w++; else if (ag === hg) d++; else l++;
    }
  }
  return { w, d, l };
}

// Returns { A: [...], B: [...], ... } — one array per group, sorted rank 1→4.
// Each entry: { code, rank, pts, w, d, l, gf, ga, gd, played }.
// Uses PROJECTION_TIE_BREAK_SEED to commit to a fixed lots draw for any ties
// that the goals-only model can't break deterministically — consistent with
// how synthesizeFullTournamentResults and buildKnockoutResolution resolve ties
// in the projected views.
export function computeAllGroupStandings(data, simResults, ctx) {
  const result = {};
  for (const group of ctx.groups) {
    const rows = simulateGroup(
      group, ctx.teamsByGroup, ctx.matrices, simResults, makeRng(PROJECTION_TIE_BREAK_SEED)
    );
    const groupMatches = data.fixtures.groupStage.filter((m) => m.group === group);
    result[group] = rows.map((row, idx) => ({
      ...row,
      rank: idx + 1,
      ...computeWDL(row.code, groupMatches, simResults),
    }));
  }
  return result;
}
