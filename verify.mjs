import { readFileSync } from "node:fs";
import { runMonteCarlo, predictMatch } from "./engine.mjs";
import { ANNEX_C_ROWS, ANNEX_C_WINNERS } from "./thirdPlaceAssignments.mjs";
import { validateResults } from "./src/lib/validateResults.js";
import { T0, resultsUpTo, timelinePoints, stageBoundaries, compareTimelineDates } from "./src/lib/timeline.js";

const load = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const data = {
  teams: load("./data/teams.json"),
  fixtures: load("./data/fixtures.json"),
};
const results = load("./data/results.json");

const teamName = {};
for (const t of data.teams.teams) teamName[t.code] = t.name;
const pct = x => (100 * x).toFixed(1).padStart(5) + "%";

console.log("=== WC 2026 Monte-Carlo — pre-tournament (results.json empty) ===\n");
const N = 40000;
console.time("simulation");
const { probs, predictions } = runMonteCarlo(data, results, N, 7);
console.timeEnd("simulation");
console.log(`runs: ${N}\n`);

// ---- title probabilities ----
const rank = Object.entries(probs).sort((a, b) => b[1].W - a[1].W);
console.log("Title probability (top 16):");
console.log("  TEAM                R16    QF     SF     FIN    TITLE");
for (const [code, p] of rank.slice(0, 16)) {
  console.log(`  ${teamName[code].padEnd(18)} ${pct(p.R16)} ${pct(p.QF)} ${pct(p.SF)} ${pct(p.F)} ${pct(p.W)}`);
}

// ---- sanity checks ----
let sumTitle = 0, sumR32 = 0;
for (const code in probs) { sumTitle += probs[code].W; sumR32 += probs[code].R32; }
console.log("\n=== sanity checks ===");
console.log(`sum of title probs   = ${sumTitle.toFixed(4)} (expect ~1.0)`);
console.log(`sum of R32 probs      = ${sumR32.toFixed(2)} (expect ~32.0 — 32 teams advance)`);
const monotone = Object.values(probs).every(p =>
  p.R32 >= p.R16 - 1e-9 && p.R16 >= p.QF - 1e-9 && p.QF >= p.SF - 1e-9 && p.SF >= p.F - 1e-9 && p.F >= p.W - 1e-9);
console.log(`stage probs monotone  = ${monotone} (each round <= previous)`);

// ---- calibration: model vs. bookmaker outright-winner odds ----
// A plausibility check, not a tuning target — see data/odds.json's _comment
// for the snapshot's source/date and why this is a point-in-time comparison.
console.log("\n=== calibration: model vs. bookmaker outright-winner odds ===");
let odds = null;
try { odds = load("./data/odds.json"); } catch { /* snapshot not present */ }
if (!odds) {
  console.log("(no data/odds.json snapshot — skipping calibration check)");
} else {
  const americanToImplied = (o) => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));
  const implied = {};
  let sumImplied = 0;
  for (const [code, o] of Object.entries(odds.odds)) {
    implied[code] = americanToImplied(o);
    sumImplied += implied[code];
  }
  // Bookmaker implied probabilities sum to > 1 (their margin, the "overround").
  // Normalise to sum to 1 — the standard way to strip it out — so this is an
  // apples-to-apples comparison with the model's probabilities (which do sum to 1).
  const fair = {};
  for (const code in implied) fair[code] = implied[code] / sumImplied;

  const compared = Object.keys(fair).filter((code) => probs[code]).sort((a, b) => fair[b] - fair[a]);
  console.log(`source: ${odds.source}, captured ${odds.capturedAt} (market: ${odds.market})`);
  console.log(`overround removed: odds implied ${(sumImplied * 100).toFixed(1)}% total before normalising\n`);
  console.log("  TEAM                model W   bookmakers    diff");
  let sumAbsDiff = 0;
  for (const code of compared) {
    const diffPp = (probs[code].W - fair[code]) * 100;
    sumAbsDiff += Math.abs(diffPp);
    const sign = diffPp >= 0 ? "+" : "";
    console.log(`  ${teamName[code].padEnd(18)} ${pct(probs[code].W)}    ${pct(fair[code])}    ${sign}${diffPp.toFixed(1)}pp`);
  }

  const modelRank = ranksWithTies(compared, (c) => probs[c].W);
  const bookRank = ranksWithTies(compared, (c) => fair[c]);
  const n = compared.length;
  let sumSqRankDiff = 0;
  for (const code of compared) sumSqRankDiff += (modelRank[code] - bookRank[code]) ** 2;
  const spearman = 1 - (6 * sumSqRankDiff) / (n * (n * n - 1));

  console.log(`\ncovers ${n}/${Object.keys(probs).length} teams (the rest aren't quoted outright odds — too unlikely to bother)`);
  console.log(`Spearman rank correlation = ${spearman.toFixed(2)} (1.0 = perfect agreement on who's more likely than whom)`);
  console.log(`mean abs. difference      = ${(sumAbsDiff / n).toFixed(1)}pp`);
}

// 1-based ranks (descending by key), tied values sharing the average rank —
// the standard correction Spearman's formula needs to stay valid under ties
// (bookmakers post round-number odds, so exact ties are common).
function ranksWithTies(codes, key) {
  const sorted = codes.slice().sort((a, b) => key(b) - key(a));
  const ranks = {};
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && key(sorted[j + 1]) === key(sorted[i])) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[sorted[k]] = avgRank;
    i = j + 1;
  }
  return ranks;
}

// ---- structural assertions: Annex C + bracket tree ----
// These are deterministic checks on the rules-encoding tables; they don't
// depend on the simulation and must pass before any further output is trusted.
{
  let failures = 0;
  function assert(cond, msg) {
    if (cond) { console.log(`  ok   ${msg}`); }
    else { console.error(`  FAIL ${msg}`); failures++; }
  }

  console.log("\n=== structural assertions ===");

  // --- Annex C table (thirdPlaceAssignments.mjs) ---
  const GROUPS = "ABCDEFGHIJKL".split("");
  const validLetters = new Set(GROUPS);

  assert(ANNEX_C_ROWS.length === 495, "Annex C: exactly 495 rows");

  let rowErrors = 0;
  for (const row of ANNEX_C_ROWS) {
    if (row.length !== 8 || new Set(row.split("")).size !== 8 || [...row].some(c => !validLetters.has(c)))
      rowErrors++;
  }
  assert(rowErrors === 0, "Annex C: every row has 8 distinct A-L letters");

  // Full C(12,8) coverage — generate all combinations and diff
  function* combinations(arr, k) {
    if (k === 0) { yield []; return; }
    for (let i = 0; i <= arr.length - k; i++)
      for (const rest of combinations(arr.slice(i + 1), k - 1))
        yield [arr[i], ...rest];
  }
  const expectedCombos = new Set();
  for (const combo of combinations(GROUPS, 8)) expectedCombos.add(combo.join(""));
  const actualCombos = new Set(ANNEX_C_ROWS.map(r => r.split("").sort().join("")));
  assert(actualCombos.size === 495 && [...expectedCombos].every(c => actualCombos.has(c)),
    "Annex C: covers all C(12,8) = 495 subsets of A-L, no gaps or duplicates");

  let colConflicts = 0;
  for (const row of ANNEX_C_ROWS)
    for (let j = 0; j < ANNEX_C_WINNERS.length; j++)
      if (row[j] === ANNEX_C_WINNERS[j]) colConflicts++;
  assert(colConflicts === 0, "Annex C: no third-placed team assigned to face its own group's winner");

  // --- Bracket tree (fixtures.json) ---
  const byStage = {};
  for (const m of data.fixtures.knockout) (byStage[m.stage] ??= []).push(m);

  assert((byStage.R32 ?? []).length === 16, "Bracket: 16 R32 matches");
  assert((byStage.R16 ?? []).length ===  8, "Bracket: 8 R16 matches");
  assert((byStage.QF  ?? []).length ===  4, "Bracket: 4 QF matches");
  assert((byStage.SF  ?? []).length ===  2, "Bracket: 2 SF matches");
  assert((byStage.F   ?? []).length ===  1, "Bracket: 1 Final match");

  // Each successive stage's slots must be {w: "<prev stage match id>"}
  // pointing at IDs that actually exist in the feeder stage.
  const feedCheck = [
    ["R16", new Set((byStage.R32 ?? []).map(m => m.id)), "R32"],
    ["QF",  new Set((byStage.R16 ?? []).map(m => m.id)), "R16"],
    ["SF",  new Set((byStage.QF  ?? []).map(m => m.id)), "QF"],
    ["F",   new Set((byStage.SF  ?? []).map(m => m.id)), "SF"],
  ];
  for (const [stage, feederIds, feederName] of feedCheck) {
    let errs = 0;
    for (const m of byStage[stage] ?? [])
      for (const side of ["home", "away"])
        if (!m[side].w || !feederIds.has(m[side].w)) errs++;
    assert(errs === 0, `Bracket: all ${stage} slots are {w: valid-${feederName}-id}`);
  }

  // --- Knockout dates (data/fixtures.json) ---
  // Required for the timeline feature: resultsUpTo() needs a date on every
  // fixture, group and knockout alike.
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const koDateOf = {};
  for (const m of data.fixtures.knockout) koDateOf[m.id] = m.date;

  let dateErrs = 0;
  for (const m of data.fixtures.knockout)
    if (!ISO_DATE.test(m.date) || m.date < "2026-06-28") dateErrs++;
  assert(dateErrs === 0, "Bracket: every knockout fixture has a valid ISO date >= 2026-06-28");

  // Each {w: "X"} feeder must be played on or before the match it feeds.
  let feederDateErrs = 0;
  for (const m of data.fixtures.knockout)
    for (const side of ["home", "away"]) {
      const feederId = m[side]?.w;
      if (!feederId) continue;
      if (!(koDateOf[feederId] <= m.date)) feederDateErrs++;
    }
  assert(feederDateErrs === 0, "Bracket: every knockout match's date is >= its feeders' dates");

  // Loose sanity bounds against the official R32 Jun28-Jul3 / R16 Jul4-7 /
  // QF Jul9-11 / SF Jul14-15 / Final Jul19 windows.
  const STAGE_RANGES = {
    R32: ["2026-06-28", "2026-07-03"],
    R16: ["2026-07-04", "2026-07-07"],
    QF:  ["2026-07-09", "2026-07-11"],
    SF:  ["2026-07-14", "2026-07-15"],
    F:   ["2026-07-19", "2026-07-19"],
  };
  let rangeErrs = 0;
  for (const [stage, [lo, hi]] of Object.entries(STAGE_RANGES))
    for (const m of byStage[stage] ?? [])
      if (m.date < lo || m.date > hi) rangeErrs++;
  assert(rangeErrs === 0, "Bracket: knockout dates fall within the official per-stage windows");

  // --- src/lib/timeline.js (timeline view helpers) ---
  const tlFixtures = data.fixtures;

  const boundaries = stageBoundaries(tlFixtures);
  assert(
    boundaries.groupsEnd === "2026-06-27" &&
      boundaries.R32 === "2026-06-28" &&
      boundaries.R16 === "2026-07-04" &&
      boundaries.QF === "2026-07-09" &&
      boundaries.SF === "2026-07-14" &&
      boundaries.F === "2026-07-19",
    "timeline: stageBoundaries() matches the official group/knockout start dates"
  );

  // resultsUpTo: a small fixed conditioning subset, checked against the real data.
  const sampleResults = { matches: { GA1: [2, 0], GA2: [1, 1], GA3: [0, 0] } };
  const upToGA1 = resultsUpTo(sampleResults, tlFixtures, "2026-06-11");
  const upToGA3 = resultsUpTo(sampleResults, tlFixtures, "2026-06-18");
  assert(
    Object.keys(upToGA1.matches).sort().join(",") === "GA1,GA2" &&
      Object.keys(upToGA3.matches).sort().join(",") === "GA1,GA2,GA3",
    "timeline: resultsUpTo() includes only matches with fixture date <= the given date"
  );

  // timelinePoints: t0 + one point per distinct date with >=1 entered result,
  // sorted chronologically (t0 first). GA1/GA2 share 2026-06-11, GA3 is
  // 2026-06-18 -> two distinct dates, deduplicated, plus t0.
  const points = timelinePoints(sampleResults, tlFixtures);
  assert(
    points.length === 3 && points[0] === T0 && points[1] === "2026-06-11" && points[2] === "2026-06-18",
    "timeline: timelinePoints() = [t0, ...distinct result dates] (no point for dates with no results)"
  );

  // compareTimelineDates: t0 sorts first, then chronological.
  const order = ["2026-07-19", T0, "2026-06-28"].sort(compareTimelineDates);
  assert(
    order[0] === T0 && order[1] === "2026-06-28" && order[2] === "2026-07-19",
    "timeline: compareTimelineDates() orders t0 before any ISO date, then chronologically"
  );

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed — fix before trusting simulation output.`);
    process.exit(1);
  }
  console.log(`  (all assertions passed)`);
}

// ---- results.json validation ----
{
  const { errors, warnings } = validateResults(results, data.fixtures);
  if (errors.length + warnings.length === 0) {
    console.log("\n=== results.json validation ===\n  ok   no issues found");
  } else {
    console.log("\n=== results.json validation ===");
    for (const msg of warnings) console.warn(`  WARN ${msg}`);
    for (const msg of errors) console.error(`  ERR  ${msg}`);
    if (errors.length > 0) {
      console.error(`\n${errors.length} results.json error(s) — fix before trusting simulation output.`);
      process.exit(1);
    }
  }
}

// ---- group A qualification ----
console.log("\n=== Group A — advance to R32 (top2 or best-third) ===");
for (const t of data.teams.teams.filter(t => t.group === "A"))
  console.log(`  ${teamName[t.code].padEnd(18)} ${pct(probs[t.code].R32)}`);

// ---- sample match predictions ----
console.log("\n=== most-likely results for a few opening matches ===");
for (const id of ["GE1", "GE6", "GH1", "GC1"]) {
  const m = predictions.find(x => x.id === id);
  if (m.played) {
    console.log(`  ${id} ${teamName[m.home]} vs ${teamName[m.away]}  — already played: ${m.score[0]}:${m.score[1]}`);
    continue;
  }
  const pr = m.prediction;
  const [h, a] = pr.mostLikely.score;
  const top = pr.top5.slice(0, 3).map(t => `${t.score[0]}:${t.score[1]} (${(100 * t.prob).toFixed(0)}%)`).join(", ");
  console.log(`  ${id} ${teamName[m.home]} vs ${teamName[m.away]}`);
  console.log(`     most likely ${h}:${a} (${(100 * pr.mostLikely.prob).toFixed(0)}%) | top3 of 5: ${top}`);
  console.log(`     tendency  H ${pct(pr.tendency.homeWin)}  D ${pct(pr.tendency.draw)}  A ${pct(pr.tendency.awayWin)}  | xG ${pr.expectedGoals[0].toFixed(2)}:${pr.expectedGoals[1].toFixed(2)}`);
}

// ---- demonstrate conditioning on a played result ----
console.log("\n=== conditioning test: force Curaçao 0-5 Germany shifts Group E ===");
const withResult = JSON.parse(JSON.stringify(results));
withResult.matches["GE1"] = [5, 0]; // GER 5-0 CUW
withResult.matches["GE6"] = [0, 3]; // ECU 0-3 GER  -> Germany very likely top
const r2 = runMonteCarlo(data, withResult, 20000, 7);
const before = probs["GER"].R32, after = r2.probs["GER"].R32;
console.log(`  Germany R32 prob: ${pct(before)} -> ${pct(after)} after two strong wins`);
console.log(`  (a played match is now fixed, the rest still simulated)`);
