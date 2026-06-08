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
function resolveGroupStandings(ctx, group, results) {
  const matches = ctx.matrices.group[group];
  if (!matches.every((m) => results.matches[m.id])) return null;

  const a = simulateGroup(group, ctx.teamsByGroup, ctx.matrices, results, makeRng(1));
  const b = simulateGroup(group, ctx.teamsByGroup, ctx.matrices, results, makeRng(2));
  const sameOrder = a.every((row, i) => row.code === b[i].code);
  return sameOrder ? a : null;
}

// Returns Map<matchId, { home: code|null, away: code|null, bothKnown }>
export function buildKnockoutResolution(data, results) {
  const ctx = buildContext(data, results, PARAMS);
  const { groups, slotDefs } = ctx;

  const standings = {};
  for (const g of groups) standings[g] = resolveGroupStandings(ctx, g, results);

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
  // boundary — same double-seed determinism check.
  let thirdAssign = null;
  if (groups.every((g) => standings[g])) {
    const bestA = pickBestThirds(thirdsRows, makeRng(1));
    const bestB = pickBestThirds(thirdsRows, makeRng(2));
    const sameQualifiers = bestA.every((t, i) => t.group === bestB[i].group);
    if (sameQualifiers) thirdAssign = assignThirds(bestA, slotDefs);
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
