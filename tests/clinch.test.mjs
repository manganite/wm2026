import { readFileSync } from "node:fs";
import { buildContext, simulateGroup, makeRng, PARAMS } from "../engine.mjs";
import { buildKnockoutResolution, deriveTeamStatus, detectGroupClinch } from "../src/lib/bracket.js";

// Deliberately reads teams/fixtures but NOT data/results.json: every scenario
// below builds its own fixed results object, so nothing here changes verdict as
// the real tournament is played out.
const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const data = {
  teams: load("../data/teams.json"),
  fixtures: load("../data/fixtures.json"),
};

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ok   ${msg}`);
  else { console.error(`  FAIL ${msg}`); failures++; }
}

// Wide-margin exhaustive oracle (0-6 goals) — test-only, not shipped as runtime.
// Explores scorelines large enough to swing GD/GF tie-breaks (catches the Group B
// bug where an 8-0 margin overtakes on GD). Capped at 6 for feasible test runtime
// (49 scorelines per match; groups with ≤ 2 remaining = 49² = 2401 max).
const ORACLE_SCORES = [];
for (let h = 0; h <= 6; h++) for (let a = 0; a <= 6; a++) ORACLE_SCORES.push([h, a]);

function exhaustiveOracle(ctx, group, results) {
  const groupFixtures = ctx.matrices.group[group];
  const remaining = groupFixtures.filter((m) => !results.matches[m.id]);
  if (remaining.length === 0) return new Map();

  const teamCodes = ctx.teamsByGroup[group].map((t) => t.code);
  const bestPos = new Map(teamCodes.map((c) => [c, 4]));
  const worstPos = new Map(teamCodes.map((c) => [c, 0]));

  const enumerate = (idx, merged) => {
    if (idx === remaining.length) {
      const table = simulateGroup(group, ctx.teamsByGroup, ctx.matrices, merged, makeRng(1));
      for (let pos = 0; pos < table.length; pos++) {
        const code = table[pos].code;
        if (pos < bestPos.get(code)) bestPos.set(code, pos);
        if (pos > worstPos.get(code)) worstPos.set(code, pos);
      }
      return;
    }
    const m = remaining[idx];
    for (const [h, a] of ORACLE_SCORES) {
      merged.matches[m.id] = [h, a];
      enumerate(idx + 1, merged);
    }
    delete merged.matches[m.id];
  };

  const merged = { matches: { ...results.matches } };
  enumerate(0, merged);

  const out = new Map();
  for (const code of teamCodes) {
    if (worstPos.get(code) <= 1) out.set(code, "clinched");
    else if (bestPos.get(code) >= 3) out.set(code, "eliminated");
    else out.set(code, null);
  }
  return out;
}

// Every scenario below is a fixed, inline results object. An earlier version of
// this file asserted against data/results.json — it pinned the exact set of
// clinched/eliminated teams at one mid-group-stage moment, so it started
// failing the moment more results were entered, and its "no group is decided
// yet" cases silently became vacuous once the group stage finished (with no
// matches remaining, detectGroupClinch returns an empty map, and every
// `!== "clinched"` assertion passes on undefined). Synthetic fixtures test the
// same logic and can't rot as the tournament advances.

// ---- Test 1: deriveTeamStatus over a partially-played group stage ----
console.log("=== clinch/elimination detection (synthetic partial group stage) ===\n");

// Group A only (MEX, RSA, KOR, CZE):
//   GA1 MEX 1-0 RSA · GA2 KOR 1-0 CZE · GA3 CZE 0-1 RSA · GA4 MEX 1-0 KOR
//   -> MEX 6pts having beaten both KOR and RSA head-to-head  => clinched
//   -> CZE 0pts having lost head-to-head to both 3pt rivals  => eliminated
//   -> KOR/RSA still live. GA5/GA6 unplayed; groups B-L untouched entirely.
// (Test 4 checks the same fixture through detectGroupClinch and validates it
// against the exhaustive oracle; this one is the whole-tournament wrapper.)
const partialResults = { matches: { GA1: [1, 0], GA2: [1, 0], GA3: [0, 1], GA4: [1, 0] } };
{
  const resolution = buildKnockoutResolution(data, partialResults);
  const status = deriveTeamStatus(data, partialResults, resolution);

  assert(status.get("MEX").depth >= 1 && status.get("MEX").status === "alive", "MEX clinched -> depth >= 1, alive");
  assert(status.get("CZE").depth === 0 && status.get("CZE").status === "eliminated", "CZE eliminated -> depth 0");
  for (const code of ["KOR", "RSA"]) {
    const s = status.get(code);
    assert(s.status === "alive" && s.depth === 0, `${code} undecided -> alive at depth 0`);
  }

  // Groups B-L have no results at all, so nothing about them can be decided.
  const untouched = data.teams.teams.filter((t) => t.group !== "A");
  const allAlive = untouched.every((t) => {
    const s = status.get(t.code);
    return s.status === "alive" && s.depth === 0;
  });
  assert(allAlive, `all ${untouched.length} teams in groups B-L (no results) remain undecided`);
}

// ---- Test 2: clinch is not fooled by a swingable goal difference ----
console.log("\n=== regression: points lead + swingable GD is NOT clinched ===\n");
{
  // Group B (CAN, SUI, BIH, QAT): CAN and SUI lead on points, but BIH's last
  // match can be won by any margin, and GD is unbounded — so neither is safe.
  // This is the bug the points-based detector was written to fix: it must
  // never assume a goal margin is out of reach.
  //   GB1 CAN 1-0 SUI · GB2 BIH 0-1 QAT · GB3 QAT 0-1 CAN · GB4 SUI 1-0 BIH
  const gbResults = { matches: { GB1: [1, 0], GB2: [0, 1], GB3: [0, 1], GB4: [1, 0] } };
  const ctx = buildContext(data, gbResults, PARAMS);
  const clinch = detectGroupClinch(ctx, "B", gbResults);
  const oracle = exhaustiveOracle(ctx, "B", gbResults);

  // Guard against the vacuous-pass trap: with matches remaining, every team
  // must carry a real verdict rather than being absent from the map.
  assert(["CAN", "SUI", "BIH", "QAT"].every((c) => clinch.has(c)), "every Group B team has a verdict (map not empty)");
  assert(clinch.get("SUI") !== "clinched", "SUI is NOT clinched (GD can still be overturned)");
  assert(oracle.get("SUI") !== "clinched", "Oracle confirms: SUI NOT clinched");
}

// ---- Test 3: runtime never stricter than the exhaustive oracle ----
console.log("\n=== runtime vs. oracle agreement (synthetic groups) ===\n");
{
  // Fixed scenarios, each leaving <= 2 matches for the oracle to enumerate.
  const scenarios = [
    ["A", { GA1: [1, 0], GA2: [1, 0], GA3: [0, 1], GA4: [1, 0] }],
    ["A", { GA1: [1, 0], GA2: [1, 0], GA3: [0, 0], GA4: [0, 0] }],
    ["A", { GA1: [3, 0], GA2: [0, 0], GA3: [1, 1], GA4: [2, 2] }],
    ["B", { GB1: [1, 0], GB2: [0, 1], GB3: [0, 1], GB4: [1, 0] }],
    ["B", { GB1: [0, 0], GB2: [2, 1], GB3: [1, 0], GB4: [0, 3] }],
  ];
  let allAgree = true;
  for (const [g, matches] of scenarios) {
    const scenario = { matches };
    const ctx = buildContext(data, scenario, PARAMS);
    const runtime = detectGroupClinch(ctx, g, scenario);
    const oracle = exhaustiveOracle(ctx, g, scenario);
    for (const [code, oracleVerdict] of oracle) {
      const runtimeVerdict = runtime.get(code);
      // Runtime may be more cautious than the oracle, never more confident.
      if (runtimeVerdict === "clinched" && oracleVerdict !== "clinched") {
        console.error(`  FAIL Group ${g}: ${code} runtime=clinched but oracle=${oracleVerdict}`);
        allAgree = false; failures++;
      }
      if (runtimeVerdict === "eliminated" && oracleVerdict !== "eliminated") {
        console.error(`  FAIL Group ${g}: ${code} runtime=eliminated but oracle=${oracleVerdict}`);
        allAgree = false; failures++;
      }
    }
  }
  if (allAgree) console.log(`  ok   runtime never stricter than oracle across ${scenarios.length} scenarios`);
}

// ---- Test 4: synthetic — h2h tie-breakers ----
console.log("\n=== synthetic: h2h tie-breakers determine clinch/elimination ===\n");
{
  // GA1: MEX 1-0 RSA, GA2: KOR 1-0 CZE, GA3: CZE 0-1 RSA, GA4: MEX 1-0 KOR
  // Remaining: GA5 (CZE vs MEX), GA6 (RSA vs KOR)
  // MEX: 6pts, beat both KOR and RSA in h2h → clinched
  // CZE: 0pts, lost h2h to both KOR and RSA → eliminated
  const syntheticResults = { matches: { GA1: [1, 0], GA2: [1, 0], GA3: [0, 1], GA4: [1, 0] } };
  const ctx = buildContext(data, syntheticResults, PARAMS);
  const clinch = detectGroupClinch(ctx, "A", syntheticResults);
  const oracle = exhaustiveOracle(ctx, "A", syntheticResults);

  assert(clinch.get("MEX") === "clinched", "MEX clinched (6pts, h2h wins over both rivals)");
  assert(clinch.get("CZE") === "eliminated", "CZE eliminated (0pts, h2h losses to all 3pt rivals)");
  assert(clinch.get("KOR") === null, "KOR undecided");
  assert(clinch.get("RSA") === null, "RSA undecided");

  // Oracle agreement
  assert(oracle.get("MEX") === "clinched", "Oracle confirms: MEX clinched");
  assert(oracle.get("CZE") === "eliminated", "Oracle confirms: CZE eliminated");
}

// ---- Test 5: synthetic — points tie NOT clinched due to GD vulnerability ----
console.log("\n=== synthetic: points tie + GD vulnerability → not clinched ===\n");
{
  // GA1: MEX 1-0 RSA, GA2: KOR 1-0 CZE, GA3: CZE 0-0 RSA, GA4: MEX 0-0 KOR
  // MEX: 4pts (W, D), KOR: 4pts (W, D), RSA: 1pt (L, D), CZE: 1pt (L, D)
  // Remaining: GA5 (CZE vs MEX), GA6 (RSA vs KOR)
  // MEX and KOR both have 4pts. Their h2h is a draw → not locked.
  // If CZE beats MEX by a huge margin and KOR also wins, KOR could overtake MEX on GD.
  // Neither MEX nor KOR should be clinched.
  const syntheticResults = { matches: { GA1: [1, 0], GA2: [1, 0], GA3: [0, 0], GA4: [0, 0] } };
  const ctx = buildContext(data, syntheticResults, PARAMS);
  const clinch = detectGroupClinch(ctx, "A", syntheticResults);
  const oracle = exhaustiveOracle(ctx, "A", syntheticResults);

  assert(clinch.get("MEX") !== "clinched", "MEX NOT clinched (h2h with KOR is a draw, GD swingable)");
  assert(clinch.get("KOR") !== "clinched", "KOR NOT clinched (h2h with MEX is a draw, GD swingable)");
  assert(oracle.get("MEX") !== "clinched", "Oracle confirms: MEX not clinched");
  assert(oracle.get("KOR") !== "clinched", "Oracle confirms: KOR not clinched");
}

// ---- Test 6: knockout depth, and the third-place play-off's place in it ----
console.log("\n=== synthetic full tournament: knockout depth + third-place play-off ===\n");
{
  // A complete, strictly-ordered group stage built from teams.json order: in
  // every group the 1st-listed team beats everyone, the 2nd beats all but the
  // 1st, and so on — 9/6/3/0 points, no ties to break. The winning margin
  // scales with the group's index so that the twelve third-placed teams have
  // distinct goal differences too (-1 for group A ... -12 for group L);
  // without that they'd be identical and the best-thirds cut would need a
  // random draw, leaving half the R32 slots unresolved.
  const groupsInOrder = [...new Set(data.teams.teams.map((t) => t.group))].sort();
  const rankInGroup = {};
  for (const g of groupsInOrder) {
    data.teams.teams.filter((t) => t.group === g).forEach((t, i) => { rankInGroup[t.code] = i; });
  }
  const matches = {};
  for (const m of data.fixtures.groupStage) {
    const margin = 1 + groupsInOrder.indexOf(m.group);
    matches[m.id] = rankInGroup[m.home] < rankInGroup[m.away] ? [margin, 0] : [0, margin];
  }
  // Every knockout match: the home side wins 1-0. Which teams those are is
  // irrelevant — the assertions below are about depth bookkeeping, not who won.
  for (const m of data.fixtures.knockout) matches[m.id] = [1, 0];

  const full = { matches };
  const resolution = buildKnockoutResolution(data, full);
  const status = deriveTeamStatus(data, full, resolution);

  const slotOf = (id) => resolution.get(id);
  const winnerOf = (id) => slotOf(id).home; // home wins 1-0 everywhere
  const loserOf = (id) => slotOf(id).away;

  assert(
    data.fixtures.knockout.every((m) => slotOf(m.id)?.bothKnown),
    "every knockout match resolved (incl. best-thirds) — the fixture is a real full tournament"
  );

  const champion = winnerOf("F");
  const runnerUp = loserOf("F");
  assert(status.get(champion).depth === 6 && status.get(champion).furthestStage === "Champion",
    `champion ${champion} -> depth 6, "Champion"`);
  assert(status.get(runnerUp).depth === 5 && status.get(runnerUp).furthestStage === "Final",
    `runner-up ${runnerUp} -> depth 5, "Final"`);

  // The point of the play-off: it decides a medal, not progression. Both
  // sides exited at the SF and must stay there — winning bronze must not
  // promote anyone, and losing it must not demote anyone (KO_DEPTH has no
  // "3P" entry, so a fall-through would derive a nonsense depth for both).
  const bronze = winnerOf("3P");
  const fourth = loserOf("3P");
  assert(
    new Set([loserOf("SF-1"), loserOf("SF-2")]).size === 2 &&
      [bronze, fourth].every((c) => c === loserOf("SF-1") || c === loserOf("SF-2")),
    "third-place play-off is contested by the two beaten semi-finalists"
  );
  for (const [code, role] of [[bronze, "bronze winner"], [fourth, "play-off loser"]]) {
    const s = status.get(code);
    assert(s.depth === 4 && s.furthestStage === "SF" && s.status === "eliminated",
      `${role} ${code} -> still depth 4 "SF", eliminated (bronze changes no progression)`);
  }
  assert(status.get(bronze).depth === status.get(fourth).depth,
    "bronze winner and play-off loser are ranked at the same depth");
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll tests passed.");
}
