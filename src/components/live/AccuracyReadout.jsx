import styles from "./AccuracyReadout.module.css";

// Baseline scores for a uniform 1/3-1/3-1/3 guess on a 3-way outcome.
const BRIER_RANDOM = 2 / 3;
const LOG_LOSS_RANDOM = Math.log(3);

// Running "track record" for the model: Brier score and log-loss of its
// pre-match tendency predictions against results entered so far. Both are
// proper scoring rules where lower is better — 0 is a perfect oracle; a
// uniform 1/3-1/3-1/3 guess on a 3-way outcome scores ~0.667 / ~1.099.
// See lib/accuracy.js for why this is scored against the pre-tournament
// baseline rather than the live, continuously-conditioned prediction.
export function AccuracyReadout({ accuracy }) {
  if (!accuracy) {
    return (
      <p className="muted">
        No matches have been played yet — a running accuracy readout will appear here once results
        start coming in.
      </p>
    );
  }

  const { brier, logLoss, n } = accuracy;

  const brierPct = Math.round(Math.max(0, (BRIER_RANDOM - brier) / BRIER_RANDOM) * 100);
  const logLossPct = Math.round(Math.max(0, (LOG_LOSS_RANDOM - logLoss) / LOG_LOSS_RANDOM) * 100);

  // Bar fill: how far score is from random toward perfect (0), clamped 0–100%.
  const brierFill = Math.min(100, Math.max(0, ((BRIER_RANDOM - brier) / BRIER_RANDOM) * 100));
  const logLossFill = Math.min(100, Math.max(0, ((LOG_LOSS_RANDOM - logLoss) / LOG_LOSS_RANDOM) * 100));

  return (
    <div className={styles.stats}>
      {n < 10 && (
        <p className={`warn-banner ${styles.caveat}`}>
          Only {n} match{n === 1 ? "" : "es"} played so far — too small a sample for these
          scores to be statistically meaningful.
        </p>
      )}

      <Stat
        label="Brier score"
        description="Average squared error of the predicted win/draw/loss probabilities"
        value={brier.toFixed(3)}
        pctBetter={brierPct}
        fill={brierFill}
        worstLabel={`~${BRIER_RANDOM.toFixed(2)} random`}
      />
      <Stat
        label="Log loss"
        description="How surprised the model was on average — penalises overconfident wrong predictions more"
        value={logLoss.toFixed(3)}
        pctBetter={logLossPct}
        fill={logLossFill}
        worstLabel={`~${LOG_LOSS_RANDOM.toFixed(2)} random`}
      />

      <p className={`muted ${styles.caption}`}>
        Scored over {n} played match{n === 1 ? "" : "es"} using the{" "}
        <em>pre-tournament</em> prediction for each fixture, so the model cannot
        use knowledge of the very result it is being evaluated on.
        Lower is better; 0 would be a perfect oracle.
      </p>
    </div>
  );
}

function Stat({ label, description, value, pctBetter, fill, worstLabel }) {
  return (
    <div className={styles.stat}>
      <div className={styles.label}>{label}</div>
      <div className={styles.description}>{description}</div>
      <div className={styles.valueRow}>
        <span className={styles.value}>{value}</span>
        <span className={styles.pctBetter}>{pctBetter}% better than random</span>
      </div>
      <div className={styles.barTrack}>
        <div className={styles.barFill} style={{ width: `${fill}%` }} />
      </div>
      <div className={styles.barLabels}>
        <span>{worstLabel}</span>
        <span>0 = perfect</span>
      </div>
    </div>
  );
}
