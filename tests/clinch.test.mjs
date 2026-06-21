import { readFileSync } from "node:fs";
import { buildContext, simulateGroup, makeRng, PARAMS } from "../engine.mjs";
import { buildKnockoutResolution, deriveTeamStatus, detectGroupClinch } from "../src/lib/bracket.js";

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const data = {
  teams: load("../data/teams.json"),
  fixtures: load("../data/fixtures.json"),
};
const results = load("../data/results.json");

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

// ---- Test 1: current results.json ----
console.log("=== clinch/elimination detection (current results) ===\n");

const resolution = buildKnockoutResolution(data, results);
const status = deriveTeamStatus(data, results, resolution);

const clinched = [];
const eliminated = [];
const alive = [];
for (const [code, s] of status) {
  if (s.depth >= 1) clinched.push(code);
  else if (s.status === "eliminated") eliminated.push(code);
  else alive.push(code);
}

console.log("Clinched (depth >= 1):", clinched.sort().join(", "));
console.log("Eliminated:", eliminated.sort().join(", "));
console.log(`Undecided: ${alive.length} teams\n`);

// CAN and SUI are NOT clinched (a lopsided BIH vs QAT result can overtake on GD).
const expectedClinched = new Set(["MEX", "USA", "GER"]);
const expectedEliminated = new Set(["HAI", "TUN", "TUR"]);

assert(
  clinched.length === expectedClinched.size && clinched.every((c) => expectedClinched.has(c)),
  `clinched top-2 = {${[...expectedClinched].sort().join(", ")}} (got {${clinched.sort().join(", ")}})`
);
assert(
  eliminated.length === expectedEliminated.size && eliminated.every((c) => expectedEliminated.has(c)),
  `eliminated = {${[...expectedEliminated].sort().join(", ")}} (got {${eliminated.sort().join(", ")}})`
);

// Groups G-L (4 matches still to play) should all be undecided
const laterGroups = ["G", "H", "I", "J", "K", "L"];
const laterTeams = data.teams.teams.filter((t) => laterGroups.includes(t.group)).map((t) => t.code);
const laterAllAlive = laterTeams.every((c) => {
  const s = status.get(c);
  return s.status === "alive" && s.depth === 0;
});
assert(laterAllAlive, "Groups G-L teams (4 matches still to play) all remain undecided");

// ---- Test 2: Group B regression — CAN and SUI NOT clinched ----
console.log("\n=== regression: Group B — CAN and SUI not clinched ===\n");
{
  const ctx = buildContext(data, results, PARAMS);
  const clinch = detectGroupClinch(ctx, "B", results);
  assert(clinch.get("CAN") !== "clinched", "CAN is NOT clinched (BIH can overtake on GD with a lopsided win)");
  assert(clinch.get("SUI") !== "clinched", "SUI is NOT clinched (same reason)");

  // Validate against wide-margin oracle
  const oracle = exhaustiveOracle(ctx, "B", results);
  assert(oracle.get("CAN") !== "clinched", "Oracle confirms: CAN NOT clinched");
  assert(oracle.get("SUI") !== "clinched", "Oracle confirms: SUI NOT clinched");
}

// ---- Test 3: runtime logic agrees with oracle on all current groups ----
console.log("\n=== runtime vs. oracle agreement (all groups with results) ===\n");
{
  const ctx = buildContext(data, results, PARAMS);
  const groups = Object.keys(ctx.teamsByGroup).sort();
  let allAgree = true;
  let groupsTested = 0;
  for (const g of groups) {
    const groupFixtures = ctx.matrices.group[g];
    const hasPlayed = groupFixtures.some((m) => results.matches[m.id]);
    const allPlayed = groupFixtures.every((m) => results.matches[m.id]);
    if (!hasPlayed || allPlayed) continue;
    const remainingCount = groupFixtures.filter((m) => !results.matches[m.id]).length;
    if (remainingCount > 2) continue; // oracle too slow for 3+ remaining matches

    groupsTested++;
    const runtime = detectGroupClinch(ctx, g, results);
    const oracle = exhaustiveOracle(ctx, g, results);

    for (const [code, oracleVerdict] of oracle) {
      const runtimeVerdict = runtime.get(code);
      // Runtime must never be stricter than oracle
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
  if (allAgree) console.log(`  ok   runtime never stricter than oracle on ${groupsTested} tested group(s)`);
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

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll tests passed.");
}
