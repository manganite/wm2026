import { ProbBar } from "../common/ProbBar.jsx";
import styles from "./MatchPrediction.module.css";

const fmtScore = ([h, a]) => `${h}:${a}`;
const fmtPct = (p) => `${(p * 100).toFixed(0)}%`;

// Shared display for a single fixture's probabilistic prediction — used for
// both group matches (sourced from runMonteCarlo's `predictions`) and
// resolvable knockout matches (sourced from a direct `predictMatch` call).
// Leads with Tendency (the clearest read on who's favoured), then breaks the
// scoreline down PER OUTCOME — because the single global modal scoreline is
// often the draw cell even when one side is the clear favourite (a real
// property of low-scoring Poisson-ish matches, not a quirk of this model: a
// concentrated draw cell can outweigh any one win cell even though the sum
// over all win cells is larger). Showing "if X win, the likeliest score is…"
// for each outcome avoids that single cell misleadingly dominating the view.
export function MatchPrediction({ prediction, homeCode, awayCode }) {
  const { mostLikelyByOutcome, top3, tendency, expectedGoals } = prediction;
  const home = homeCode || "Home";
  const away = awayCode || "Away";

  return (
    <div className={styles.grid}>
      <div className={styles.block}>
        <div className={styles.label}>Tendency</div>
        <div className={styles.tendency}>
          <div className={styles.tendencyRow}>
            <span className={styles.tag}>{home}</span>
            <ProbBar value={tendency.homeWin} />
          </div>
          <div className={styles.tendencyRow}>
            <span className={styles.tag}>Draw</span>
            <ProbBar value={tendency.draw} />
          </div>
          <div className={styles.tendencyRow}>
            <span className={styles.tag}>{away}</span>
            <ProbBar value={tendency.awayWin} />
          </div>
        </div>
      </div>

      <div className={styles.block}>
        <div className={styles.label}>Most likely score, by outcome</div>
        <div className={styles.byOutcome}>
          <div className={styles.outcomeRow}>
            <span className={styles.tag}>{home} win</span>
            <span className={styles.score}>{fmtScore(mostLikelyByOutcome.homeWin.score)}</span>
            <span className={styles.scoreProb}>{fmtPct(mostLikelyByOutcome.homeWin.prob)} of those</span>
          </div>
          <div className={styles.outcomeRow}>
            <span className={styles.tag}>Draw</span>
            <span className={styles.score}>{fmtScore(mostLikelyByOutcome.draw.score)}</span>
            <span className={styles.scoreProb}>{fmtPct(mostLikelyByOutcome.draw.prob)} of those</span>
          </div>
          <div className={styles.outcomeRow}>
            <span className={styles.tag}>{away} win</span>
            <span className={styles.score}>{fmtScore(mostLikelyByOutcome.awayWin.score)}</span>
            <span className={styles.scoreProb}>{fmtPct(mostLikelyByOutcome.awayWin.prob)} of those</span>
          </div>
        </div>
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
        <div className={styles.label}>Expected goals (xG)</div>
        <span className={styles.xg}>
          {expectedGoals[0].toFixed(2)} : {expectedGoals[1].toFixed(2)}
        </span>
      </div>

    </div>
  );
}
