// Centralizes "given the actual entered results, which knockout matches have
// both participants concretely determined?" — used by the fixtures panel, the
// bracket view, and the accuracy readout. Built entirely from the engine's own
// (now-exported) routines: never reimplements tie-break, best-thirds, or
// shootout-token logic, so it can never drift from engine.mjs's behaviour.
import {
  buildContext,
  simulateGroup,
  pickBestThirds,
  assignThirds,
  resolveWinnerToken,
  makeRng,
  PARAMS,
} from "../../engine.mjs";

// A group's standings are only "concretely known" once all of its matches are
// played AND the engine's own ordering wouldn't fall through to its RNG-based
// tie-break (an exact tie on points/GD/GF/head-to-head — rare, and FIFA would
// resolve it by drawing lots in reality too). We detect this without
// duplicating the comparator: run simulateGroup with two different seeds and
// check the resulting order agrees — if the RNG fallback were exercised, two
// different seeds would (almost certainly) disagree.
//
// `tieBreakSeed`, when given, skips that agreement check and commits to a
// single run's order instead — for hypothetical *projections* (see
// lib/selectors.js's synthesizeFullTournamentResults), where there's no "wait
// and see": resolving a tie via one fixed, reproducible lots draw is exactly
// as legitimate a modelling choice as picking a match's modal score, and the
// engine already treats lots-drawing as a first-class randomized procedure
// (simulateGroup/pickBestThirds take an `rng` for precisely this). The real
// (results-driven) bracket view never passes this — it must stay honest about
// what the actual tournament has and hasn't yet decided.
function resolveGroupStandings(ctx, group, results, tieBreakSeed) {
  const matches = ctx.matrices.group[group];
  if (!matches.every((m) => results.matches[m.id])) return null;

  if (tieBreakSeed != null) {
    return simulateGroup(group, ctx.teamsByGroup, ctx.matrices, results, makeRng(tieBreakSeed));
  }

  const a = simulateGroup(group, ctx.teamsByGroup, ctx.matrices, results, makeRng(1));
  const b = simulateGroup(group, ctx.teamsByGroup, ctx.matrices, results, makeRng(2));
  const sameOrder = a.every((row, i) => row.code === b[i].code);
  return sameOrder ? a : null;
}

// Returns Map<matchId, { home: code|null, away: code|null, bothKnown }>
// `tieBreakSeed`: see resolveGroupStandings — propagated to both the group
// and best-thirds tie-breaks so a projection commits to one coherent draw of
// lots throughout, rather than stalling at the first genuine tie.
export function buildKnockoutResolution(data, results, { tieBreakSeed } = {}) {
  const ctx = buildContext(data, results, PARAMS);
  const { groups, slotDefs } = ctx;

  const standings = {};
  for (const g of groups) standings[g] = resolveGroupStandings(ctx, g, results, tieBreakSeed);

  const winners = {};
  const runners = {};
  const thirdsRows = [];
  for (const g of groups) {
    const st = standings[g];
    if (!st) continue;
    winners[g] = st[0].code;
    runners[g] = st[1].code;
    thirdsRows.push({ group: g, row: st[2] });
  }

  // Best-thirds slots need ALL groups resolved (qualification compares thirds
  // across every group) and, again, no RNG-fallback tie at the qualification
  // boundary — same double-seed determinism check (or the same single-seed
  // commitment when projecting).
  let thirdAssign = null;
  if (groups.every((g) => standings[g])) {
    if (tieBreakSeed != null) {
      const best = pickBestThirds(thirdsRows, makeRng(tieBreakSeed));
      thirdAssign = assignThirds(best, slotDefs);
    } else {
      const bestA = pickBestThirds(thirdsRows, makeRng(1));
      const bestB = pickBestThirds(thirdsRows, makeRng(2));
      const sameQualifiers = bestA.every((t, i) => t.group === bestB[i].group);
      if (sameQualifiers) thirdAssign = assignThirds(bestA, slotDefs);
    }
  }

  function resolveRef(ref) {
    if (ref.win) return winners[ref.win] ?? null;
    if (ref.run) return runners[ref.run] ?? null;
    if (ref.w) return winnerOf[ref.w] ?? null;
    if (ref.t) {
      const slot = thirdAssign?.[ref._slotId];
      return slot ? slot.row.code : null;
    }
    return null;
  }

  // fixtures.knockout is listed in dependency order (R32 -> R16 -> QF -> SF -> F):
  // every {w: id} ref names a match that appears earlier in the array, so a
  // single forward pass resolves participants and (for played matches) winners.
  const resolved = new Map();
  const winnerOf = {};

  for (const m of data.fixtures.knockout) {
    const home = resolveRef(m.home);
    const away = resolveRef(m.away);
    resolved.set(m.id, { home, away, bothKnown: home != null && away != null });

    const played = results.matches[m.id];
    if (played && home != null && away != null) {
      const [gh, ga] = played;
      const forced = resolveWinnerToken(played[2], home, away);
      const winner = forced ?? (gh > ga ? home : ga > gh ? away : null);
      // a level score with no shootout token is, in the engine, decided by its
      // (random) penalty model — genuinely undeterminable here; leave unset
      if (winner) winnerOf[m.id] = winner;
    }
  }

  return resolved;
}

const KO_STAGES = ["R32", "R16", "QF", "SF", "F"];

// Describes how far the ACTUAL tournament has progressed, based purely on
// which matches have entries in results.json. Drives the "now" marker (past =
// actual, future = projected) on the progression view.
// Returns { stage: 'group'|'R32'|'R16'|'QF'|'SF'|'F'|'complete', played, total }
export function deriveTournamentProgress(fixtures, results) {
  const playedOf = (matches) => matches.filter((m) => results.matches[m.id]).length;

  const groupTotal = fixtures.groupStage.length;
  const groupPlayed = playedOf(fixtures.groupStage);
  if (groupPlayed < groupTotal) return { stage: "group", played: groupPlayed, total: groupTotal };

  let last = { stage: "group", played: groupTotal, total: groupTotal };
  for (const stage of KO_STAGES) {
    const matches = fixtures.knockout.filter((m) => m.stage === stage);
    const played = playedOf(matches);
    last = { stage, played, total: matches.length };
    if (played < matches.length) return last;
  }
  return { ...last, stage: "complete" };
}

// Which side ('home'|'away'|null) won a played knockout match — a thin,
// pure wrapper over the now-exported resolveWinnerToken, used to highlight
// the winner in the bracket view and to surface shootout winners.
export function matchWinnerSide(played, homeCode, awayCode) {
  if (!played || !homeCode || !awayCode) return null;
  const [gh, ga] = played;
  const forced = resolveWinnerToken(played[2], homeCode, awayCode);
  if (forced) return forced === homeCode ? "home" : "away";
  if (gh > ga) return "home";
  if (ga > gh) return "away";
  return null;
}

// Human-readable fallback label for a knockout slot whose occupant isn't
// concretely known yet — e.g. "Group A winner", "Best 3rd (A/B/C/D/F)".
export function describeRef(ref) {
  if (ref.win) return `Group ${ref.win} winner`;
  if (ref.run) return `Group ${ref.run} runner-up`;
  if (ref.w) return `Winner of ${ref.w}`;
  if (ref.t) return `Best 3rd (${ref.t.join("/")})`;
  return "TBD";
}

const DEPTH_LABELS = ["Group exit", "R32", "R16", "QF", "SF", "Final", "Champion"];
const KO_DEPTH = { R32: 2, R16: 3, QF: 4, SF: 5, F: 6 };

// Points-based clinch/elimination detection that is correct by construction:
// never relies on a bounded goal margin. Points bounds are exact; the only
// tie-break treated as "winnable" is a head-to-head already locked. Everything
// else is assumed against the team, so verdicts hold under all remaining results.
//
// Clinched top-2: at most 1 rival can possibly finish above T.
// Eliminated: at least 3 rivals are guaranteed to finish above T (can't reach 3rd).
export function detectGroupClinch(ctx, group, results) {
  const groupFixtures = ctx.matrices.group[group];
  const remaining = groupFixtures.filter((m) => !results.matches[m.id]);
  if (remaining.length === 0) return new Map();

  const teamCodes = ctx.teamsByGroup[group].map((t) => t.code);

  // Current points and remaining match count per team
  const currentPts = {};
  const remainingCount = {};
  for (const code of teamCodes) {
    currentPts[code] = 0;
    remainingCount[code] = 0;
  }
  for (const m of groupFixtures) {
    const played = results.matches[m.id];
    if (played) {
      const [gh, ga] = played;
      if (gh > ga) currentPts[m.home] += 3;
      else if (gh < ga) currentPts[m.away] += 3;
      else { currentPts[m.home] += 1; currentPts[m.away] += 1; }
    } else {
      remainingCount[m.home]++;
      remainingCount[m.away]++;
    }
  }

  // Head-to-head results already played (only the single group-stage meeting).
  // h2h[A][B] = "A" if A won, "B" if B won, "draw" if drawn, undefined if unplayed.
  const h2h = {};
  for (const code of teamCodes) h2h[code] = {};
  for (const m of groupFixtures) {
    const played = results.matches[m.id];
    if (!played) continue;
    const [gh, ga] = played;
    if (gh > ga) { h2h[m.home][m.away] = m.home; h2h[m.away][m.home] = m.home; }
    else if (ga > gh) { h2h[m.home][m.away] = m.away; h2h[m.away][m.home] = m.away; }
    else { h2h[m.home][m.away] = "draw"; h2h[m.away][m.home] = "draw"; }
  }

  // Whether T and R still have a remaining match against each other
  const haveRemaining = {};
  for (const code of teamCodes) haveRemaining[code] = {};
  for (const m of remaining) {
    haveRemaining[m.home][m.away] = true;
    haveRemaining[m.away][m.home] = true;
  }

  // T is guaranteed above R iff R can never finish above T.
  // R can finish above T unless:
  //   maxPtsR < minPtsT (strict points gap), OR
  //   they can tie on points AND T has a locked h2h win over R (no remaining
  //   meeting, T already won their match). Overall GD/GF can be swung
  //   arbitrarily, so never assume T wins those.
  function guaranteedAbove(t, r) {
    const maxPtsR = currentPts[r] + 3 * remainingCount[r];
    const minPtsT = currentPts[t]; // T loses all remaining
    if (maxPtsR < minPtsT) return true;
    if (maxPtsR === minPtsT) {
      // R can at most tie T on points — T wins iff h2h is locked in T's favour
      if (h2h[t][r] === t && !haveRemaining[t]?.[r]) return true;
    }
    return false;
  }

  // R can possibly finish above T iff T is NOT guaranteed above R.
  function canFinishAbove(r, t) {
    return !guaranteedAbove(t, r);
  }

  // R is guaranteed above T iff T can never finish above R.
  // This is the mirror: R has a strict points floor above T's ceiling,
  // or they tie and R has a locked h2h win.
  function guaranteedAboveForElim(r, t) {
    const minPtsR = currentPts[r]; // R loses all remaining
    const maxPtsT = currentPts[t] + 3 * remainingCount[t];
    if (minPtsR > maxPtsT) return true;
    if (minPtsR === maxPtsT) {
      // T can at most tie R — R wins iff h2h locked in R's favour
      if (h2h[r][t] === r && !haveRemaining[r]?.[t]) return true;
    }
    return false;
  }

  const out = new Map();
  for (const t of teamCodes) {
    const rivals = teamCodes.filter((c) => c !== t);

    // Clinched top-2: at most 1 rival can possibly finish above T
    const rivalsCanFinishAbove = rivals.filter((r) => canFinishAbove(r, t)).length;
    if (rivalsCanFinishAbove <= 1) {
      out.set(t, "clinched");
      continue;
    }

    // Eliminated: at least 3 rivals guaranteed above T (can't reach 3rd)
    const rivalsGuaranteedAbove = rivals.filter((r) => guaranteedAboveForElim(r, t)).length;
    if (rivalsGuaranteedAbove >= 3) {
      out.set(t, "eliminated");
      continue;
    }

    out.set(t, null);
  }
  return out;
}

// For each team, determine how far they've actually progressed and whether
// they're eliminated, alive, or pending (third-placed awaiting best-8-of-12).
// Returns Map<code, { depth, status, furthestStage }>.
// Reuses the engine's own group/bracket resolution — no reimplemented tie-breaks.
export function deriveTeamStatus(data, results, knockoutResolution) {
  const ctx = buildContext(data, results, PARAMS);
  const { groups } = ctx;
  const status = new Map();

  for (const t of data.teams.teams) {
    status.set(t.code, { depth: 0, status: "alive", furthestStage: DEPTH_LABELS[0] });
  }

  const groupComplete = {};
  const standings = {};
  for (const g of groups) {
    const matches = data.fixtures.groupStage.filter((m) => m.group === g);
    groupComplete[g] = matches.every((m) => results.matches[m.id]);
    if (groupComplete[g]) {
      standings[g] = resolveGroupStandings(ctx, g, results);
    }
  }

  // Early clinch/elimination for incomplete groups
  for (const g of groups) {
    if (groupComplete[g]) continue;
    const clinch = detectGroupClinch(ctx, g, results);
    for (const [code, verdict] of clinch) {
      if (verdict === "clinched") {
        status.set(code, { depth: 1, status: "alive", furthestStage: "Advanced" });
      } else if (verdict === "eliminated") {
        status.set(code, { depth: 0, status: "eliminated", furthestStage: DEPTH_LABELS[0] });
      }
    }
  }

  const allGroupsDone = groups.every((g) => groupComplete[g]);

  let qualifiedThirds = null;
  if (allGroupsDone) {
    const thirdsRows = [];
    for (const g of groups) {
      if (!standings[g]) continue;
      thirdsRows.push({ group: g, row: standings[g][2] });
    }
    if (thirdsRows.length === groups.length) {
      const bestA = pickBestThirds(thirdsRows, makeRng(1));
      const bestB = pickBestThirds(thirdsRows, makeRng(2));
      const sameQualifiers = bestA.every((t, i) => t.group === bestB[i].group);
      if (sameQualifiers) {
        qualifiedThirds = new Set(bestA.map((t) => t.row.code));
      }
    }
  }

  for (const g of groups) {
    if (!groupComplete[g]) continue;
    const st = standings[g];
    if (!st) continue;

    for (let i = 0; i < 2; i++) {
      status.set(st[i].code, { depth: 1, status: "alive", furthestStage: DEPTH_LABELS[1] });
    }

    const thirdCode = st[2].code;
    if (!allGroupsDone) {
      status.set(thirdCode, { depth: 0, status: "pending", furthestStage: "3rd (pending)" });
    } else if (qualifiedThirds?.has(thirdCode)) {
      status.set(thirdCode, { depth: 1, status: "alive", furthestStage: DEPTH_LABELS[1] });
    } else {
      status.set(thirdCode, { depth: 0, status: "eliminated", furthestStage: DEPTH_LABELS[0] });
    }

    status.set(st[3].code, { depth: 0, status: "eliminated", furthestStage: DEPTH_LABELS[0] });
  }

  // Walk knockout matches to update depth for participants
  for (const m of data.fixtures.knockout) {
    const played = results.matches[m.id];
    const slot = knockoutResolution.get(m.id);
    if (!slot?.bothKnown || !played) continue;

    const winSide = matchWinnerSide(played, slot.home, slot.away);
    const winnerCode = winSide === "home" ? slot.home : winSide === "away" ? slot.away : null;
    const loserCode = winSide === "home" ? slot.away : winSide === "away" ? slot.home : null;

    const stageDepth = KO_DEPTH[m.stage] ?? 0;

    if (winnerCode) {
      const prev = status.get(winnerCode);
      if (stageDepth > (prev?.depth ?? 0)) {
        status.set(winnerCode, { depth: stageDepth, status: "alive", furthestStage: DEPTH_LABELS[stageDepth] });
      }
    }
    if (loserCode) {
      const reachedDepth = (KO_DEPTH[m.stage] ?? 1) - 1;
      const prev = status.get(loserCode);
      if (reachedDepth >= (prev?.depth ?? 0)) {
        status.set(loserCode, { depth: reachedDepth, status: "eliminated", furthestStage: DEPTH_LABELS[reachedDepth] });
      }
    }
  }

  return status;
}
