import { ProbBar } from "../common/ProbBar.jsx";
import styles from "./MatchPrediction.module.css";

const fmtScore = ([h, a]) => `${h}:${a}`;
const fmtPct = (p) => `${(p * 100).toFixed(0)}%`;

// Shared display for a single fixture's probabilistic prediction — used for
// both group matches (sourced from runMonteCarlo's `predictions`) and
// resolvable knockout matches (sourced from a direct `predictMatch` call).
// Renders most-likely score, top-3, tendency and xG as four DISTINCT blocks —
// deliberately not collapsed into one verdict, since the modal score and the
// win-tendency can point different ways (e.g. most-likely 1:1 while the
// favourite still holds the higher win probability).
export function MatchPrediction({ prediction, homeCode, awayCode }) {
  const { mostLikely, top3, tendency, expectedGoals } = prediction;

  return (
    <div className={styles.grid}>
      <div className={styles.block}>
        <div className={styles.label}>Most likely score</div>
        <span className={styles.score}>{fmtScore(mostLikely.score)}</span>
        <span className={styles.scoreProb}>{fmtPct(mostLikely.prob)} chance</span>
      </div>

      <div className={styles.block}>
        <div className={styles.label}>Top 3 scorelines</div>
        <div className={styles.top3}>
          {top3.map((t, i) => (
            <div key={i}>
              {fmtScore(t.score)}
              <span>{fmtPct(t.prob)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.block}>
        <div className={styles.label}>Tendency</div>
        <div className={styles.tendency}>
          <div className={styles.tendencyRow}>
            <span className={styles.tag}>{homeCode || "Home"}</span>
            <ProbBar value={tendency.homeWin} />
          </div>
          <div className={styles.tendencyRow}>
            <span className={styles.tag}>Draw</span>
            <ProbBar value={tendency.draw} />
          </div>
          <div className={styles.tendencyRow}>
            <span className={styles.tag}>{awayCode || "Away"}</span>
            <ProbBar value={tendency.awayWin} />
          </div>
        </div>
      </div>

      <div className={styles.block}>
        <div className={styles.label}>Expected goals (xG)</div>
        <span className={styles.xg}>
          {expectedGoals[0].toFixed(2)} : {expectedGoals[1].toFixed(2)}
        </span>
      </div>

      <p className={styles.caption}>
        The modal scoreline and the win/draw/loss tendency can disagree — both are shown as the
        model sees them. Tournament-wide advancement and title odds come from the full
        distribution over all simulated runs, not from any single match's prediction.
      </p>
    </div>
  );
}
