import { readFileSync } from "node:fs";
import { buildContext, PARAMS } from "../engine.mjs";
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

console.log("=== clinch/elimination detection ===\n");

// --- Test against current results.json ---
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

// NED is NOT clinched: a 3-way tie at 4pts with JPN via cycle is possible.
// TUR IS eliminated: lost both games and h2h vs PAR (only rival at 3pts).
const expectedClinched = new Set(["MEX", "CAN", "SUI", "USA", "GER"]);
const expectedEliminated = new Set(["HAI", "TUN", "TUR"]);

assert(
  clinched.length === expectedClinched.size && clinched.every((c) => expectedClinched.has(c)),
  `clinched top-2 = {${[...expectedClinched].sort().join(", ")}} (got {${clinched.sort().join(", ")}})`
);
assert(
  eliminated.length === expectedEliminated.size && eliminated.every((c) => expectedEliminated.has(c)),
  `eliminated = {${[...expectedEliminated].sort().join(", ")}} (got {${eliminated.sort().join(", ")}})`
);

// Groups G-L have 4 matches still to play — all their teams should be undecided
const laterGroups = ["G", "H", "I", "J", "K", "L"];
const laterTeams = data.teams.teams.filter((t) => laterGroups.includes(t.group)).map((t) => t.code);
const laterAllAlive = laterTeams.every((c) => {
  const s = status.get(c);
  return s.status === "alive" && s.depth === 0;
});
assert(laterAllAlive, "Groups G-L teams (4 matches still to play) all remain undecided");

// --- Synthetic test: h2h tie-breakers determine clinch/elimination ---
console.log("\n=== synthetic: h2h tie-breakers determine clinch/elimination ===\n");
{
  // After 4 of 6 Group A matches:
  // GA1: MEX 1-0 RSA, GA2: KOR 1-0 CZE, GA3: CZE 0-1 RSA, GA4: MEX 1-0 KOR
  // Remaining: GA5 (CZE vs MEX), GA6 (RSA vs KOR)
  // MEX: 6pts, beat both KOR and RSA in h2h → clinched top 2
  // CZE: 0pts, lost h2h to both KOR and RSA → eliminated (can't beat 3rd-place rival in h2h)
  // KOR: 3pts, undecided (can reach 2nd or finish 3rd)
  // RSA: 3pts, undecided (can reach 2nd or finish 3rd)
  const syntheticResults = {
    matches: {
      GA1: [1, 0],
      GA2: [1, 0],
      GA3: [0, 1],
      GA4: [1, 0],
    },
  };
  const ctx = buildContext(data, syntheticResults, PARAMS);
  const clinch = detectGroupClinch(ctx, "A", syntheticResults);
  assert(clinch.get("MEX") === "clinched", "MEX clinched top-2 (6pts, h2h wins over both rivals)");
  assert(clinch.get("CZE") === "eliminated", "CZE eliminated (0pts, h2h losses to all rivals at 3pts)");
  assert(clinch.get("KOR") === null, "KOR undecided (3pts, could finish 2nd or 3rd)");
  assert(clinch.get("RSA") === null, "RSA undecided (3pts, could finish 2nd or 3rd)");
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll tests passed.");
}
