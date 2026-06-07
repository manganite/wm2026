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

const fmtScore = ([h, a]) => `${h}:${a}`;
const fmtPct = (p) => `${(p * 100).toFixed(0)}%`;

function buildMatch(fixture, results, resolution, eloOf, teamsByCode) {
  const slot = resolution.get(fixture.id);
  const homeCode = slot?.home ?? null;
  const awayCode = slot?.away ?? null;
  const labelFor = (code, ref) => (code ? teamsByCode[code]?.name ?? code : describeRef(ref));
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
      score: played ? played[0] : null,
      isWinner: winnerSide === "home",
    },
    away: {
      code: awayCode,
      label: labelFor(awayCode, fixture.away),
      score: played ? played[1] : null,
      isWinner: winnerSide === "away",
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
export function KnockoutBracket({ teams, fixtures, results, knockoutResolution, eloOf }) {
  const teamsByCode = useMemo(() => Object.fromEntries(teams.map((t) => [t.code, t])), [teams]);

  const rounds = useMemo(() => {
    const byStage = {};
    for (const m of fixtures.knockout) (byStage[m.stage] ??= []).push(m);
    return STAGES.filter((s) => byStage[s]).map((stage) => ({
      stage,
      matches: byStage[stage].map((m) => buildMatch(m, results, knockoutResolution, eloOf, teamsByCode)),
    }));
  }, [fixtures, results, knockoutResolution, eloOf, teamsByCode]);

  return (
    <div>
      <div className={styles.bracket}>
        {rounds.map(({ stage, matches }) => (
          <div className={styles.round} key={stage}>
            <div className={styles.roundTitle}>{STAGE_TITLES[stage]}</div>
            <div className={styles.matches}>
              {matches.map((m) => (
                <div className={styles.match} key={m.id}>
                  <span className={styles.matchId}>{m.id}</span>
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
      <p className={`muted ${styles.note}`}>
        "Projected" scorelines are the model's single most-likely outcome for matches whose two
        sides are now concretely known — shown with their probability so they read as a guess, not
        a result. The full win/draw/tendency and xG breakdown for the same matches is in Fixtures
        → Knockout stage. Slots still labelled by description (e.g. "Group A winner") remain split
        across several teams — the bracket only fills them in once results or shootouts decide it.
      </p>
    </div>
  );
}
