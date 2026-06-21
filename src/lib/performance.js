import { outcomeOf } from "./accuracy.js";

// Metric A: aggregate per-match performance vs. model expectation per team.
// Goal difference works uniformly across all matches (group + knockout).
// Points are group-stage only by definition — knockout over/under-performance
// is captured by Metric B (progression vs. expected depth).
export function computeTeamPerformance(matchDetails, teams) {
  const map = new Map();
  for (const t of teams) {
    map.set(t.code, {
      code: t.code,
      matches: 0,
      groupMatches: 0,
      totalDeltaGD: 0,
      totalDeltaPts: 0,
      matchRows: [],
    });
  }

  for (const row of matchDetails) {
    for (const side of ["home", "away"]) {
      const code = row[side];
      const entry = map.get(code);
      if (!entry) continue;

      const isHome = side === "home";
      const goalsFor = isHome ? row.actualScore[0] : row.actualScore[1];
      const goalsAgainst = isHome ? row.actualScore[1] : row.actualScore[0];
      const lamFor = isHome ? row.lamHome : row.lamAway;
      const lamAgainst = isHome ? row.lamAway : row.lamHome;
      const actualGD = goalsFor - goalsAgainst;
      const expGD = lamFor - lamAgainst;

      entry.matches++;
      entry.totalDeltaGD += actualGD - expGD;

      const matchRow = {
        id: row.id,
        opponent: isHome ? row.away : row.home,
        goalsFor,
        goalsAgainst,
        actualGD,
        expGD,
        stage: row.stage,
        date: row.date,
      };

      if (row.stage === "group") {
        const actualOutcome = outcomeOf(goalsFor, goalsAgainst);
        const actualPts = actualOutcome === "homeWin" ? 3 : actualOutcome === "draw" ? 1 : 0;
        const xPts = isHome ? row.xPtsHome : row.xPtsAway;
        entry.groupMatches++;
        entry.totalDeltaPts += actualPts - xPts;
        matchRow.actualPts = actualPts;
        matchRow.xPts = xPts;
      }

      entry.matchRows.push(matchRow);
    }
  }

  const result = [];
  for (const entry of map.values()) {
    if (entry.matches === 0) continue;
    result.push({
      ...entry,
      perMatchDeltaGD: entry.totalDeltaGD / entry.matches,
      perMatchDeltaPts: entry.groupMatches > 0 ? entry.totalDeltaPts / entry.groupMatches : 0,
    });
  }
  return result;
}

const STAGE_KEYS = ["R32", "R16", "QF", "SF", "F", "W"];

// Metric B: tournament progression vs. pre-tournament expected depth.
// Expected depth = sum of reach-probabilities (since reaching a deeper stage
// implies all shallower ones). Uses the T0 prior, never live-conditioned probs.
export function computeProgressionDelta(teams, t0Probs, teamStatus) {
  if (!t0Probs || !teamStatus) return [];

  return teams.map((t) => {
    const probs = t0Probs[t.code];
    if (!probs) return null;

    const expDepth = STAGE_KEYS.reduce((sum, k) => sum + (probs[k] ?? 0), 0);
    const st = teamStatus.get(t.code);
    const actualDepth = st?.depth ?? 0;

    return {
      code: t.code,
      expDepth,
      actualDepth,
      delta: actualDepth - expDepth,
      status: st?.status ?? "alive",
      furthestStage: st?.furthestStage ?? "?",
      reachProbs: Object.fromEntries(STAGE_KEYS.map((k) => [k, probs[k] ?? 0])),
    };
  }).filter(Boolean);
}
