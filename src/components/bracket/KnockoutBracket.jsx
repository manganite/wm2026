import { useMemo } from "react";
import { predictMatch, PARAMS } from "../../../engine.mjs";
import { describeRef, matchWinnerSide } from "../../lib/bracket.js";
import { BracketSlot } from "./BracketSlot.jsx";
import styles from "./KnockoutBracket.module.css";

// The win-and-advance tree only. The third-place play-off is a knockout
// fixture too, but it's a branch off the tree rather than part of it — it's
// rendered separately below (see PLAYOFF_STAGE), not as a sixth column.
const STAGES = ["R32", "R16", "QF", "SF", "F"];
const PLAYOFF_STAGE = "3P";
const STAGE_TITLES = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-finals",
  SF: "Semi-finals",
  F: "Final",
};
const STAGE_NAV_LABELS = { R32: "R32", R16: "R16", QF: "QF", SF: "SF", F: "Final" };

const fmtScore = ([h, a]) => `${h}:${a}`;
const fmtPct = (p) => `${(p * 100).toFixed(0)}%`;

// Up to this many candidates are shown per unfilled slot — narrow bracket
// columns have no room for a long tail, and low-probability entries don't
// change the picture ("who's actually in contention for this slot").
const MAX_ADVANCEMENT_CANDIDATES = 4;

function buildMatch(fixture, results, resolution, eloOf, teamsByCode, slotAdvancement) {
  const slot = resolution.get(fixture.id);
  const homeCode = slot?.home ?? null;
  const awayCode = slot?.away ?? null;
  const labelFor = (code, ref) => (code ? teamsByCode[code]?.name ?? code : describeRef(ref));
  const advancementFor = (code, side) =>
    code ? null : slotAdvancement?.[`${fixture.id}:${side}`]?.slice(0, MAX_ADVANCEMENT_CANDIDATES) ?? null;
  const played = results.matches[fixture.id];
  const winnerSide = matchWinnerSide(played, homeCode, awayCode);

  // Resolved-but-unplayed matches get the model's single most-likely scoreline
  // as a clearly-probabilistic "projection" — the full win/draw/tendency/xG
  // breakdown for the same match lives in Fixtures -> Knockout stage (the
  // narrow bracket column has no room for MatchPrediction's four-block grid).
  let projected = null;
  if (!played && slot?.bothKnown) {
    projected = predictMatch(eloOf[homeCode], eloOf[awayCode], PARAMS).mostLikely;
  }

  return {
    id: fixture.id,
    home: {
      code: homeCode,
      label: labelFor(homeCode, fixture.home),
      via: describeRef(fixture.home),
      score: played ? played[0] : null,
      isWinner: winnerSide === "home",
      advancement: advancementFor(homeCode, "home"),
    },
    away: {
      code: awayCode,
      label: labelFor(awayCode, fixture.away),
      via: describeRef(fixture.away),
      score: played ? played[1] : null,
      isWinner: winnerSide === "away",
      advancement: advancementFor(awayCode, "away"),
    },
    projected,
  };
}

function MatchCard({ match, teamsByCode }) {
  return (
    <div className={styles.match}>
      <BracketSlot {...match.home} teamsByCode={teamsByCode} />
      <BracketSlot {...match.away} teamsByCode={teamsByCode} />
      {match.projected && (
        <div className={styles.projection}>
          Projected {fmtScore(match.projected.score)} <span>· {fmtPct(match.projected.prob)} chance</span>
        </div>
      )}
    </div>
  );
}

// Renders the knockout bracket as one column per round (R32 -> Final), each a
// flex column with justify-content: space-around so successive halvings line
// up with their feeder pair's midpoint — the standard CSS-only bracket trick.
// Adjacency is never hardcoded: it falls out entirely from walking
// fixtures.knockout and resolving each {win}/{run}/{w}/{t} ref through
// knockoutResolution (built in lib/bracket.js from the engine's own,
// now-exported standings/shootout logic). Slots whose occupant isn't
// concretely known yet show only their description ("Group A winner", "Best
// 3rd (A/B/C/D/F)") — never a fabricated team or score.
export function KnockoutBracket({ teams, fixtures, results, knockoutResolution, eloOf, slotAdvancement }) {
  const teamsByCode = useMemo(() => Object.fromEntries(teams.map((t) => [t.code, t])), [teams]);

  const rounds = useMemo(() => {
    const byStage = {};
    for (const m of fixtures.knockout) (byStage[m.stage] ??= []).push(m);
    return STAGES.filter((s) => byStage[s]).map((stage) => ({
      stage,
      matches: byStage[stage].map((m) =>
        buildMatch(m, results, knockoutResolution, eloOf, teamsByCode, slotAdvancement)
      ),
    }));
  }, [fixtures, results, knockoutResolution, eloOf, teamsByCode, slotAdvancement]);

  const playoff = useMemo(() => {
    const fixture = fixtures.knockout.find((m) => m.stage === PLAYOFF_STAGE);
    if (!fixture) return null;
    return buildMatch(fixture, results, knockoutResolution, eloOf, teamsByCode, slotAdvancement);
  }, [fixtures, results, knockoutResolution, eloOf, teamsByCode, slotAdvancement]);

  return (
    <div>
      <details className={`muted ${styles.note}`}>
        <summary>Undetermined slots show simulation probabilities; confirmed slots show teams.</summary>
        <p style={{ marginTop: "6px" }}>
          "Spain 18%" means Spain ends up in this bracket slot in 18% of all simulated
          tournaments. Once real results concretely decide a slot it fills in with that team.
          For matches where both sides are known but not yet played, a "Projected" scoreline
          shows the model's most-likely outcome — a guess, not a result. The full breakdown
          is in Fixtures → Knockout stage.
        </p>
      </details>
      <div className={styles.roundNav}>
        {rounds.map(({ stage }) => (
          <button
            key={stage}
            className={styles.roundNavItem}
            onClick={() => document.getElementById(`bracket-${stage}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            {STAGE_NAV_LABELS[stage]}
          </button>
        ))}
        {playoff && (
          <button
            className={styles.roundNavItem}
            onClick={() => document.getElementById("bracket-3P")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            3rd place
          </button>
        )}
      </div>
      <div className={styles.bracket} tabIndex={0} role="region" aria-label="Knockout bracket">
        {rounds.map(({ stage, matches }) => (
          <div className={styles.round} id={`bracket-${stage}`} key={stage}>
            <div className={styles.roundTitle}>{STAGE_TITLES[stage]}</div>
            <div className={styles.matches}>
              {matches.map((m) => (
                <MatchCard key={m.id} match={m} teamsByCode={teamsByCode} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {playoff && (
        <div className={styles.playoff} id="bracket-3P">
          <div className={styles.playoffTitle}>Third-place play-off</div>
          <div className={styles.playoffBody}>
            <div className={styles.playoffMatch}>
              <MatchCard match={playoff} teamsByCode={teamsByCode} />
            </div>
            <p className={`muted ${styles.playoffNote}`}>
              The two beaten semi-finalists meet the day before the Final. It sits outside the
              bracket above: it decides the bronze medal, not who advances, so winning it doesn't
              change how far a team is counted as having gone. Each side's chance of winning it
              is the "Win 3rd place" column in Tournament outlook.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
