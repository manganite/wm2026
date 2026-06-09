// Sweep RATING_SIGMA and print calibration stats vs. bookmaker odds.
// Usage: node scripts/calibrate.mjs
// Requires data/odds.json (see its _comment for source/format).
// Does NOT auto-edit PARAMS — pick the sigma value you want and set it by hand.

import { readFileSync } from "node:fs";
import { runMonteCarlo, PARAMS } from "../engine.mjs";

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const data = { teams: load("../data/teams.json"), fixtures: load("../data/fixtures.json") };
const results = load("../data/results.json");

let odds;
try { odds = load("../data/odds.json"); }
catch { console.error("data/odds.json not found — nothing to calibrate against."); process.exit(1); }

const teamName = {};
for (const t of data.teams.teams) teamName[t.code] = t.name;

const americanToImplied = (o) => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));
const implied = {};
let sumImplied = 0;
for (const [code, o] of Object.entries(odds.odds)) {
  implied[code] = americanToImplied(o);
  sumImplied += implied[code];
}
const fair = {};
for (const code in implied) fair[code] = implied[code] / sumImplied;

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

const N_RUNS = 40000;
const SIGMA_STEPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
const compared = Object.keys(fair).sort((a, b) => fair[b] - fair[a]);

console.log(`Calibration sweep — RATING_SIGMA vs. bookmaker odds (N=${N_RUNS.toLocaleString()})`);
console.log(`Source: ${odds.source}, captured ${odds.capturedAt}`);
console.log(`Comparing ${compared.length} teams with quoted outright odds\n`);
console.log("  sigma   MAD(pp)   Spearman ρ   worst deviations");
console.log("  -----   -------   ----------   ----------------");

let bestSigma = null, bestMad = Infinity;

for (const sigma of SIGMA_STEPS) {
  // Patch PARAMS with overridden sigma — runMonteCarlo reads PARAMS directly,
  // so we temporarily mutate it and restore after. Safe in a single-threaded script.
  const saved = PARAMS.RATING_SIGMA;
  PARAMS.RATING_SIGMA = sigma;
  const { probs } = runMonteCarlo(data, results, N_RUNS, 7);
  PARAMS.RATING_SIGMA = saved;

  const modelRank = ranksWithTies(compared, (c) => probs[c]?.W ?? 0);
  const bookRank = ranksWithTies(compared, (c) => fair[c]);
  const n = compared.length;
  let sumAbsDiff = 0, sumSqRankDiff = 0;
  const diffs = [];
  for (const code of compared) {
    const diff = ((probs[code]?.W ?? 0) - fair[code]) * 100;
    sumAbsDiff += Math.abs(diff);
    sumSqRankDiff += (modelRank[code] - bookRank[code]) ** 2;
    diffs.push({ code, diff });
  }
  const mad = sumAbsDiff / n;
  const rho = 1 - (6 * sumSqRankDiff) / (n * (n * n - 1));
  diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const worst = diffs.slice(0, 3).map(d => `${teamName[d.code]} ${d.diff >= 0 ? "+" : ""}${d.diff.toFixed(1)}pp`).join(", ");

  if (mad < bestMad) { bestMad = mad; bestSigma = sigma; }

  const marker = mad === bestMad ? " ◀ best" : "";
  console.log(`  ${String(sigma).padStart(3)}     ${mad.toFixed(2).padStart(5)}pp   ${rho.toFixed(2).padStart(6)}         ${worst}${marker}`);
}

console.log(`\nRecommended: RATING_SIGMA = ${bestSigma}  (MAD = ${bestMad.toFixed(2)}pp)`);
console.log("Set PARAMS.RATING_SIGMA in engine.mjs, then re-run node verify.mjs to confirm.");
