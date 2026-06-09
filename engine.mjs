// ============================================================================
//  WC 2026 Monte-Carlo engine  —  pure logic, no DOM. Works in Node and browser.
//
//  Match model:  goals ~ Poisson, with a Dixon-Coles low-score correction.
//  lambda from Elo:  goal supremacy = eloDiff / ELO_PER_GOAL, split around BASE_TOTAL.
//  Played matches (from results) are conditioned on, not sampled.
// ============================================================================

import { ANNEX_C_WINNERS, ANNEX_C_ROWS } from "./thirdPlaceAssignments.mjs";

export const PARAMS = {
  BASE_TOTAL: 2.65,     // avg total goals in an even match
  ELO_PER_GOAL: 220,    // Elo gap that buys ~1 goal of supremacy
  HOME_ADV: 0,          // neutral venues at a WC (host bonus handled per-team if desired)
  RHO: -0.06,           // Dixon-Coles dependence (negative => slightly more draws/low scores)
  MAX_GOALS: 10,        // truncation for the scoreline matrix
  ET_FACTOR: 1 / 3,     // extra-time = 1/3 of a match worth of goals
  RATING_SIGMA: 100,    // std-dev of per-team-per-run Elo noise; regresses favourites toward
                        // the field by representing unknown-true-strength uncertainty.
                        // Applied only in MC sampling — never in predictMatch (display) or when
                        // a real result conditions a match. Tuned via scripts/calibrate.mjs:
                        // σ=100 halves Spain/Argentina overconfidence vs. market (~10pp→~6pp)
                        // while keeping Spearman ρ ≈ 0.83. Re-run calibrate.mjs after any
                        // Elo update to check if this value needs adjusting.
};

// ---- seedable RNG (mulberry32) ---------------------------------------------
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller transform: two uniform samples → one standard-normal draw.
// `u` avoids log(0) since rng() theoretically returns 0 for seed state 0.
function gaussianSample(rng) {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---- Poisson + Dixon-Coles --------------------------------------------------
function poissonPmf(lambda, maxK) {
  const out = new Array(maxK + 1);
  let p = Math.exp(-lambda);
  out[0] = p;
  for (let k = 1; k <= maxK; k++) { p = (p * lambda) / k; out[k] = p; }
  return out;
}

function dcTau(x, y, lh, la, rho) {
  if (x === 0 && y === 0) return 1 - lh * la * rho;
  if (x === 0 && y === 1) return 1 + lh * rho;
  if (x === 1 && y === 0) return 1 + la * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

// Build a normalized, DC-adjusted scoreline matrix M[h][a] plus a flat CDF for sampling.
export function buildScoreMatrix(lamH, lamA, params = PARAMS) {
  const N = params.MAX_GOALS, rho = params.RHO;
  const ph = poissonPmf(lamH, N), pa = poissonPmf(lamA, N);
  const M = [];
  const flat = [];
  let total = 0;
  for (let h = 0; h <= N; h++) {
    M[h] = [];
    for (let a = 0; a <= N; a++) {
      let p = ph[h] * pa[a] * dcTau(h, a, lamH, lamA, rho);
      if (p < 0) p = 0;
      M[h][a] = p;
      total += p;
    }
  }
  // normalize + build CDF
  let cum = 0;
  for (let h = 0; h <= N; h++)
    for (let a = 0; a <= N; a++) {
      M[h][a] /= total;
      cum += M[h][a];
      flat.push({ h, a, cum });
    }
  return { M, flat, lamH, lamA };
}

export function eloToLambdas(eloH, eloA, params = PARAMS) {
  const diff = eloH - eloA + params.HOME_ADV;
  const sup = diff / params.ELO_PER_GOAL;          // expected goal difference
  let lamH = (params.BASE_TOTAL + sup) / 2;
  let lamA = (params.BASE_TOTAL - sup) / 2;
  lamH = Math.max(0.12, lamH);
  lamA = Math.max(0.12, lamA);
  return { lamH, lamA };
}

function sampleFromMatrix(sm, rng) {
  const r = rng();
  const flat = sm.flat;
  // linear scan is fine (≤121 cells); binary search if MAX_GOALS grows
  for (let i = 0; i < flat.length; i++) if (r <= flat[i].cum) return [flat[i].h, flat[i].a];
  return [flat[flat.length - 1].h, flat[flat.length - 1].a];
}

// Descriptive prediction for a single fixture with known participants.
export function predictMatch(eloH, eloA, params = PARAMS) {
  const { lamH, lamA } = eloToLambdas(eloH, eloA, params);
  const sm = buildScoreMatrix(lamH, lamA, params);
  let best = { h: 0, a: 0, p: 0 };
  // argmax cell within each outcome bucket — the "if this outcome happens,
  // here's the most likely exact score" complement to the global mode (which,
  // in low-scoring matches, is very often the draw cell even when one side is
  // the clear favourite — a real property of Poisson-ish scorelines, not a bug).
  let bestH = { h: 0, a: 0, p: 0 }, bestD = { h: 0, a: 0, p: 0 }, bestA = { h: 0, a: 0, p: 0 };
  const cells = [];
  let pH = 0, pD = 0, pA = 0;
  for (let h = 0; h <= params.MAX_GOALS; h++)
    for (let a = 0; a <= params.MAX_GOALS; a++) {
      const p = sm.M[h][a];
      cells.push({ h, a, p });
      if (p > best.p) best = { h, a, p };
      if (h > a) { pH += p; if (p > bestH.p) bestH = { h, a, p }; }
      else if (h === a) { pD += p; if (p > bestD.p) bestD = { h, a, p }; }
      else { pA += p; if (p > bestA.p) bestA = { h, a, p }; }
    }
  cells.sort((x, y) => y.p - x.p);
  return {
    mostLikely: { score: [best.h, best.a], prob: best.p },
    mostLikelyByOutcome: {
      // probabilities are conditional on the outcome — "given the home side
      // wins, there's an X% chance it's specifically this score" — not
      // weighted by how likely that outcome itself is (see `tendency` for that).
      homeWin: { score: [bestH.h, bestH.a], prob: bestH.p / pH },
      draw: { score: [bestD.h, bestD.a], prob: bestD.p / pD },
      awayWin: { score: [bestA.h, bestA.a], prob: bestA.p / pA },
    },
    top5: cells.slice(0, 5).map(c => ({ score: [c.h, c.a], prob: c.p })),
    tendency: { homeWin: pH, draw: pD, awayWin: pA },
    expectedGoals: [lamH, lamA],
  };
}

// ---- group stage ------------------------------------------------------------
function emptyRow(code) {
  return { code, pts: 0, gf: 0, ga: 0, gd: 0, played: 0 };
}

// Standings for one group, conditioning on played results. Ranking follows
// FIFA's official Article 13 (2026 regulations): points, then — for teams
// level on points — a head-to-head mini-league (points/GD/GF from just their
// mutual matches, recursively re-run on whichever subset still can't be
// separated, per Article 13 "Step 2"), then overall GD, overall GF, and
// finally a single random draw. That draw stands in for Article 13's two
// remaining criteria — team conduct ("fair play") score and FIFA World
// Ranking — neither of which this goals-only model can evaluate: no
// card/discipline data is simulated, and Elo is a different rating system to
// FIFA's (see the _comment in data/teams.json — "only the relative ordering
// drives the simulation"). It's an honest, unbiased resolution of a tie the
// model genuinely has no signal on, not a pretence at reproducing those rules.
export function simulateGroup(groupCode, teamsByGroup, matrices, results, rng) {
  const rows = {};
  for (const t of teamsByGroup[groupCode]) rows[t.code] = emptyRow(t.code);
  const matches = matrices.group[groupCode];
  const played = []; // { home, away, gh, ga } — raw match list for mini-leagues
  for (const m of matches) {
    let gh, ga;
    const entered = results.matches[m.id];
    if (entered) { gh = entered[0]; ga = entered[1]; }
    else { [gh, ga] = sampleFromMatrix(m.sm, rng); }
    const H = rows[m.home], A = rows[m.away];
    H.gf += gh; H.ga += ga; A.gf += ga; A.ga += gh; H.played++; A.played++;
    if (gh > ga) H.pts += 3; else if (gh < ga) A.pts += 3; else { H.pts++; A.pts++; }
    played.push({ home: m.home, away: m.away, gh, ga });
  }
  const arr = Object.values(rows);
  for (const r of arr) r.gd = r.gf - r.ga;

  // One random key per team, assigned once: `rng()` called from inside a sort
  // comparator would run a variable, engine-dependent number of times per
  // pair and yield a biased, non-uniform order — not the fair draw intended.
  const drawKey = {};
  for (const r of arr) drawKey[r.code] = rng();

  return rankStandings(arr, played, drawKey);
}

// Tiers teams by points (Article 13's entry criterion), then resolves each
// tied tier in turn.
function rankStandings(rows, played, drawKey) {
  const out = [];
  for (const tier of tierBy(rows, (r) => r.pts)) {
    out.push(...(tier.length === 1 ? tier : resolveTie(tier, played, drawKey)));
  }
  return out;
}

// Article 13 Step 1+2: rank by a head-to-head mini-league (points, then GD,
// then GF — counting only matches among `teams`); any run that's still fully
// tied on all three gets the mini-league recomputed and re-applied to just
// that smaller subset ("Step 2" narrowing). A run that doesn't shrink at all
// (e.g. a perfect 3-way cycle: A beat B beat C beat A, all level on pts/GD/GF)
// can never be separated this way — Article 13 says fall through to d)-h).
function resolveTie(teams, played, drawKey) {
  const mini = miniLeagueTable(teams, played);
  const ranked = teams.slice().sort((x, y) => {
    const mx = mini.get(x.code), my = mini.get(y.code);
    return my.pts - mx.pts || my.gd - mx.gd || my.gf - mx.gf;
  });
  const runs = [];
  for (const r of ranked) {
    const last = runs[runs.length - 1];
    if (last && sameMini(mini.get(last[0].code), mini.get(r.code))) last.push(r);
    else runs.push([r]);
  }
  if (runs.length === 1) return fallback(teams, drawKey); // no separation at all
  const out = [];
  for (const run of runs) out.push(...(run.length === 1 ? run : resolveTie(run, played, drawKey)));
  return out;
}

function sameMini(a, b) {
  return a.pts === b.pts && a.gd === b.gd && a.gf === b.gf;
}

// pts/gd/gf from only the matches played among `teams` — Article 13's
// "matches between the teams concerned", recomputed fresh at each narrowing
// (a smaller subset can have a different mini-league than its parent).
function miniLeagueTable(teams, played) {
  const codes = new Set(teams.map((t) => t.code));
  const table = new Map(teams.map((t) => [t.code, { pts: 0, gf: 0, ga: 0, gd: 0 }]));
  for (const { home, away, gh, ga } of played) {
    if (!codes.has(home) || !codes.has(away)) continue;
    const H = table.get(home), A = table.get(away);
    H.gf += gh; H.ga += ga; A.gf += ga; A.ga += gh;
    if (gh > ga) H.pts += 3; else if (gh < ga) A.pts += 3; else { H.pts++; A.pts++; }
  }
  for (const row of table.values()) row.gd = row.gf - row.ga;
  return table;
}

// Article 13 d)-h): overall GD, then overall GF, then the single draw standing
// in for conduct score and World Ranking (see simulateGroup's comment). These
// are all per-team scalars, so — unlike head-to-head — a flat multi-key sort
// already gives exactly "apply the next criterion to whoever's still tied,
// without restarting", which is what Article 13 specifies for this stage.
function fallback(teams, drawKey) {
  return teams.slice().sort((x, y) =>
    y.gd - x.gd || y.gf - x.gf || drawKey[x.code] - drawKey[y.code]
  );
}

// Stable-groups `rows` into descending-by-`key(row)` tiers (`Array.sort` has
// been stable since ES2019, so within-tier relative order is preserved).
function tierBy(rows, key) {
  const sorted = rows.slice().sort((x, y) => key(y) - key(x));
  const tiers = [];
  for (const r of sorted) {
    const last = tiers[tiers.length - 1];
    if (last && key(last[0]) === key(r)) last.push(r);
    else tiers.push([r]);
  }
  return tiers;
}

// ---- best 8 of the 12 third-placed teams ------------------------------------
// Order matches Article 13's best-thirds chain exactly — points, overall GD,
// overall GF (head-to-head never applies: these teams played in different
// groups). The final draw stands in for the same two criteria simulateGroup's
// fallback does (team conduct score, FIFA World Ranking — see its comment),
// using a random key assigned once per team rather than `rng()` from inside
// the comparator (which would bias the order — see simulateGroup).
export function pickBestThirds(thirds, rng) {
  const drawKey = new Map(thirds.map((t) => [t, rng()]));
  const arr = thirds.slice();
  arr.sort((x, y) => {
    if (y.row.pts !== x.row.pts) return y.row.pts - x.row.pts;
    if (y.row.gd !== x.row.gd) return y.row.gd - x.row.gd;
    if (y.row.gf !== x.row.gf) return y.row.gf - x.row.gf;
    return drawKey.get(x) - drawKey.get(y);
  });
  return arr.slice(0, 8); // [{group, row}]
}

// FIFA's official Annex C table, keyed by the sorted-letters combination of
// qualifying groups (a pure function of the combination — see
// thirdPlaceAssignments.mjs for the source and validation).
const THIRD_PLACE_LOOKUP = new Map();
for (let i = 0; i < ANNEX_C_ROWS.length; i++) {
  const letters = ANNEX_C_ROWS[i];
  const byWinner = {};
  for (let j = 0; j < ANNEX_C_WINNERS.length; j++) byWinner[ANNEX_C_WINNERS[j]] = letters[j];
  const combo = letters.split("").sort().join("");
  THIRD_PLACE_LOOKUP.set(combo, byWinner);
}

// Assign the 8 qualifying thirds to the 8 third-slots using FIFA's official
// Annex C lookup table: for the specific combination of 8 qualifying groups,
// it specifies exactly which group's third faces each fixed group-winner.
export function assignThirds(qualThirds, slotDefs) {
  const byGroup = {}; for (const q of qualThirds) byGroup[q.group] = q;
  const combo = qualThirds.map(q => q.group).sort().join("");
  const byWinner = THIRD_PLACE_LOOKUP.get(combo);
  const assignment = {};
  for (const slot of slotDefs) assignment[slot.slotId] = byGroup[byWinner[slot.fixedWinner]];
  return assignment;
}

// ---- knockout ---------------------------------------------------------------
// Resolve an optional shootout-winner token (3rd element of a played KO result).
// Accepts a team code, or "H"/"HOME"/"A"/"AWAY" (case-insensitive). Returns the
// winning code, or null if absent/unrecognized.
export function resolveWinnerToken(token, homeCode, awayCode) {
  if (token == null) return null;
  const t = String(token).toUpperCase();
  if (t === "H" || t === "HOME") return homeCode;
  if (t === "A" || t === "AWAY") return awayCode;
  if (t === homeCode.toUpperCase()) return homeCode;
  if (t === awayCode.toUpperCase()) return awayCode;
  return null;
}

function pensWinner(homeCode, awayCode, eloOf, rng) {
  // near coin-flip with a slight Elo edge
  const pHome = 1 / (1 + Math.pow(10, -(eloOf[homeCode] - eloOf[awayCode]) / 2000));
  return rng() < pHome ? homeCode : awayCode;
}

function knockoutWinner(homeCode, awayCode, eloOf, matrices, results, matchId, rng) {
  const played = results.matches[matchId];
  if (played) {
    const gh = played[0], ga = played[1];
    // a shootout winner, if given, is authoritative
    const forced = resolveWinnerToken(played[2], homeCode, awayCode);
    if (forced) return forced;
    if (gh > ga) return homeCode;
    if (ga > gh) return awayCode;
    // level score with no winner token: decide by the penalty model (documented
    // fallback — to avoid this, add the shootout winner as a 3rd element)
    return pensWinner(homeCode, awayCode, eloOf, rng);
  }
  const sm = matrices.ko(homeCode, awayCode);
  let [gh, ga] = sampleFromMatrix(sm, rng);
  if (gh !== ga) return gh > ga ? homeCode : awayCode;
  // extra time
  const et = matrices.koET(homeCode, awayCode);
  const [eh, ea] = sampleFromMatrix(et, rng);
  gh += eh; ga += ea;
  if (gh !== ga) return gh > ga ? homeCode : awayCode;
  // penalties
  return pensWinner(homeCode, awayCode, eloOf, rng);
}

// ---- one full tournament ----------------------------------------------------

// Builds a complete matrices object (group + ko + koET) from a given eloOf map,
// without caching. Used per-run when RATING_SIGMA > 0 to ensure each simulation
// run uses its own perturbed Elo values throughout — both group stage and knockout.
function buildNoisyMatrices(groupStageFixtures, noisyEloOf, params) {
  const groupMatrices = {};
  for (const m of groupStageFixtures) {
    if (!groupMatrices[m.group]) groupMatrices[m.group] = [];
    const { lamH, lamA } = eloToLambdas(noisyEloOf[m.home], noisyEloOf[m.away], params);
    groupMatrices[m.group].push({ ...m, sm: buildScoreMatrix(lamH, lamA, params) });
  }
  return {
    group: groupMatrices,
    ko: (h, a) => {
      const { lamH, lamA } = eloToLambdas(noisyEloOf[h], noisyEloOf[a], params);
      return buildScoreMatrix(lamH, lamA, params);
    },
    koET: (h, a) => {
      const { lamH, lamA } = eloToLambdas(noisyEloOf[h], noisyEloOf[a], params);
      return buildScoreMatrix(lamH * params.ET_FACTOR, lamA * params.ET_FACTOR, params);
    },
  };
}

export function simulateTournament(ctx, rng, overrides = {}) {
  const { groups, teamsByGroup, results, knockout, slotDefs } = ctx;
  const eloOf = overrides.eloOf ?? ctx.eloOf;
  const matrices = overrides.matrices ?? ctx.matrices;
  const standings = {};
  const winners = {}, runners = {}, thirds = [];
  for (const g of groups) {
    const table = simulateGroup(g, teamsByGroup, matrices, results, rng);
    standings[g] = table;
    winners[g] = table[0].code;
    runners[g] = table[1].code;
    thirds.push({ group: g, row: table[2] });
  }
  const best = pickBestThirds(thirds, rng);
  const thirdAssign = assignThirds(best, slotDefs);

  // resolve match participants and play through the bracket
  const resultWinner = {};
  const reached = {}; // code -> furthest stage index
  const STAGE = { R32: 1, R16: 2, QF: 3, SF: 4, F: 5, W: 6 };

  // everyone who made R32:
  const inR32 = new Set();
  for (const g of groups) { inR32.add(winners[g]); inR32.add(runners[g]); }
  for (const b of best) inR32.add(b.row.code);
  for (const c of inR32) reached[c] = Math.max(reached[c] || 0, STAGE.R32);

  function resolveRef(ref) {
    if (ref.win) return winners[ref.win];
    if (ref.run) return runners[ref.run];
    if (ref.w) return resultWinner[ref.w];
    if (ref.t) {
      // find which slot this t-set corresponds to (match by allowed set)
      // handled via slotId injected during prep (see buildContext)
      return ref._team;
    }
    return null;
  }

  // inject resolved third teams into the t-refs (extract the team CODE, not the object)
  for (const m of knockout) {
    for (const side of ["home", "away"]) {
      const ref = m[side];
      if (ref.t) { const a = thirdAssign[ref._slotId]; ref._team = a ? a.row.code : null; }
    }
  }

  // record which team fills every slot ({win}/{run}/{w}/{t} alike) this run —
  // tallied by runMonteCarlo into per-slot "advancement probabilities" for the
  // bracket UI (see buildContext: every ref carries a stable `_slotId`). Must
  // happen inside this loop, in fixtures.knockout's dependency order: a {w}
  // ref's resolution depends on resultWinner entries set by earlier matches.
  const slotFills = {};
  for (const m of knockout) {
    const home = resolveRef(m.home), away = resolveRef(m.away);
    slotFills[m.home._slotId] = home;
    slotFills[m.away._slotId] = away;
    const w = knockoutWinner(home, away, eloOf, matrices, results, m.id, rng);
    resultWinner[m.id] = w;
    const nextStage = { R32: STAGE.R16, R16: STAGE.QF, QF: STAGE.SF, SF: STAGE.F, F: STAGE.W }[m.stage];
    reached[w] = Math.max(reached[w] || 0, nextStage);
  }
  return { reached, champion: resultWinner["F"], slotFills };
}

// ---- context builder (precompute matrices once) -----------------------------
export function buildContext(data, results, params = PARAMS) {
  const { teams } = data.teams;
  const eloOf = {};
  const teamsByGroup = {};
  for (const t of teams) {
    eloOf[t.code] = t.elo;
    (teamsByGroup[t.group] = teamsByGroup[t.group] || []).push(t);
  }
  const groups = Object.keys(teamsByGroup).sort();

  // group-match score matrices (fixed participants -> precompute once)
  const groupMatrices = {};
  for (const g of groups) groupMatrices[g] = [];
  for (const m of data.fixtures.groupStage) {
    const { lamH, lamA } = eloToLambdas(eloOf[m.home], eloOf[m.away], params);
    groupMatrices[m.group].push({ ...m, sm: buildScoreMatrix(lamH, lamA, params) });
  }

  // memoized knockout matrices by elo pair
  const koCache = new Map();
  function koMatrix(home, away, factor = 1) {
    const key = home + "|" + away + "|" + factor;
    if (koCache.has(key)) return koCache.get(key);
    const base = eloToLambdas(eloOf[home], eloOf[away], params);
    const sm = buildScoreMatrix(base.lamH * factor, base.lamA * factor, params);
    koCache.set(key, sm);
    return sm;
  }
  const matrices = {
    group: groupMatrices,
    ko: (h, a) => koMatrix(h, a, 1),
    koET: (h, a) => koMatrix(h, a, params.ET_FACTOR),
  };

  // Every knockout-match side gets a stable slotId ("<matchId>:<side>"),
  // regardless of ref kind ({win}/{run}/{w}/{t}) — used both to look up the
  // Annex C best-thirds placement (t-refs only, via slotDefs/fixedWinner) and,
  // more generally, to tally "which team ends up filling this slot" across MC
  // runs (every ref kind) for the UI's per-slot advancement-probability display.
  // `fixedWinner` is the group letter of the fixed group-winner a Best-3rd slot
  // faces (the official R32 schedule always pairs one against the other side of
  // the same match) — the key Annex C looks up by.
  const slotDefs = [];
  for (const m of data.fixtures.knockout) {
    for (const side of ["home", "away"]) {
      const ref = m[side];
      ref._slotId = m.id + ":" + side;
      if (ref.t) {
        const other = m[side === "home" ? "away" : "home"];
        slotDefs.push({ slotId: ref._slotId, allowed: ref.t, fixedWinner: other.win });
      }
    }
  }

  return {
    groups, teamsByGroup, matrices, results, eloOf,
    knockout: data.fixtures.knockout, slotDefs, teams,
  };
}

// ---- Monte-Carlo driver -----------------------------------------------------
export function runMonteCarlo(data, results, N = 20000, seed = 12345) {
  const params = PARAMS;
  const ctx = buildContext(data, results, params);
  const rng = makeRng(seed);
  const STAGES = ["R32", "R16", "QF", "SF", "F", "W"]; // reached >= idx+1
  const SIGMA = params.RATING_SIGMA || 0;
  const tally = {};
  for (const t of ctx.teams) tally[t.code] = { R32: 0, R16: 0, QF: 0, SF: 0, F: 0, W: 0 };

  // slotTally[slotId][code] = how many runs that team filled that bracket slot
  // — the raw material for "advancement probabilities feeding unfilled slots".
  const slotTally = {};

  for (let i = 0; i < N; i++) {
    // Per-run Elo noise: one draw per team, consistent across group stage and
    // knockout within the same run. Only active when RATING_SIGMA > 0.
    let runOverrides;
    if (SIGMA > 0) {
      const noisyEloOf = {};
      for (const code in ctx.eloOf) noisyEloOf[code] = ctx.eloOf[code] + gaussianSample(rng) * SIGMA;
      runOverrides = { eloOf: noisyEloOf, matrices: buildNoisyMatrices(data.fixtures.groupStage, noisyEloOf, params) };
    }
    const { reached, slotFills } = simulateTournament(ctx, rng, runOverrides);
    for (const code in reached) {
      if (!tally[code]) continue; // defensive: skip any unresolved ref
      const r = reached[code];
      if (r >= 1) tally[code].R32++;
      if (r >= 2) tally[code].R16++;
      if (r >= 3) tally[code].QF++;
      if (r >= 4) tally[code].SF++;
      if (r >= 5) tally[code].F++;
      if (r >= 6) tally[code].W++;
    }
    for (const slotId in slotFills) {
      const code = slotFills[slotId];
      if (!code) continue;
      const bucket = (slotTally[slotId] ??= {});
      bucket[code] = (bucket[code] || 0) + 1;
    }
  }

  const probs = {};
  for (const code in tally) {
    probs[code] = {};
    for (const s of STAGES) probs[code][s] = tally[code][s] / N;
  }

  // slotAdvancement[slotId] = [{ code, prob }, ...] sorted high -> low, for
  // every knockout-match side — "the advancement probabilities feeding" each
  // bracket slot (brief: unfilled slots should show these). Slots whose match
  // is already played collapse to ~100% for the real participant, since
  // resolveRef/knockoutWinner short-circuit to `results` every run.
  const slotAdvancement = {};
  for (const slotId in slotTally) {
    const bucket = slotTally[slotId];
    slotAdvancement[slotId] = Object.entries(bucket)
      .map(([code, count]) => ({ code, prob: count / N }))
      .sort((a, b) => b.prob - a.prob);
  }

  // analytic per-match predictions for fixtures whose participants are known now
  const predictions = predictKnownMatches(data, results, ctx, params);

  return { N, probs, predictions, slotAdvancement };
}

// Predict every match whose two teams are currently determined
// (all group matches now; knockout matches once results fix the participants).
export function predictKnownMatches(data, results, ctx, params = PARAMS) {
  const out = [];
  const eloOf = ctx.eloOf;
  for (const m of data.fixtures.groupStage) {
    const played = results.matches[m.id];
    const base = { id: m.id, stage: "group", group: m.group, home: m.home, away: m.away };
    if (played) out.push({ ...base, played: true, score: played });
    else out.push({ ...base, played: false, prediction: predictMatch(eloOf[m.home], eloOf[m.away], params) });
  }
  // knockout: only predictable if both participants are concretely known via played results
  // (left to the UI once the bracket fills; included here when resolvable)
  return out;
}
