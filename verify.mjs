import { readFileSync } from "node:fs";
import { runMonteCarlo, predictMatch } from "./engine.mjs";

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

// ---- group A qualification ----
console.log("\n=== Group A — advance to R32 (top2 or best-third) ===");
for (const t of data.teams.teams.filter(t => t.group === "A"))
  console.log(`  ${teamName[t.code].padEnd(18)} ${pct(probs[t.code].R32)}`);

// ---- sample match predictions ----
console.log("\n=== most-likely results for a few opening matches ===");
for (const id of ["GE1", "GE6", "GH1", "GC1"]) {
  const m = predictions.find(x => x.id === id);
  const pr = m.prediction;
  const [h, a] = pr.mostLikely.score;
  const top = pr.top3.map(t => `${t.score[0]}:${t.score[1]} (${(100 * t.prob).toFixed(0)}%)`).join(", ");
  console.log(`  ${id} ${teamName[m.home]} vs ${teamName[m.away]}`);
  console.log(`     most likely ${h}:${a} (${(100 * pr.mostLikely.prob).toFixed(0)}%) | top3: ${top}`);
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
