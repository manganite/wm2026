import { useMemo } from "react";
import { predictMatch, PARAMS } from "../../../engine.mjs";
import { describeRef, matchWinnerSide } from "../../lib/bracket.js";
import { BracketSlot } from "./BracketSlot.jsx";
import styles from "./KnockoutBracket.module.css";

const STAGES = ["R32", "R16", "QF", "SF", "F"];
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

  return (
    <div>
      <p className={`muted ${styles.note}`}>
        Undetermined slots show which teams the simulation has reaching that position and how
        often — e.g. "Spain 18%" means Spain ends up in this bracket slot in 18% of all simulated
        tournaments. Once real results concretely decide a slot (group winner, shootout winner,
        etc.) it fills in with that team. For matches where both sides are already known but not
        yet played, a "Projected" scoreline shows the model's single most-likely outcome with its
        probability — a guess, not a result; the full win/draw/tendency and xG breakdown for the
        same match is in Fixtures → Knockout stage.
      </p>
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
      </div>
      <div className={styles.bracket}>
        {rounds.map(({ stage, matches }) => (
          <div className={styles.round} id={`bracket-${stage}`} key={stage}>
            <div className={styles.roundTitle}>{STAGE_TITLES[stage]}</div>
            <div className={styles.matches}>
              {matches.map((m) => (
                <div className={styles.match} key={m.id}>
                  <BracketSlot {...m.home} teamsByCode={teamsByCode} />
                  <BracketSlot {...m.away} teamsByCode={teamsByCode} />
                  {m.projected && (
                    <div className={styles.projection}>
                      Projected {fmtScore(m.projected.score)} <span>· {fmtPct(m.projected.prob)} chance</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
