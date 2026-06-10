import styles from "./AccuracyReadout.module.css";

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

  return (
    <div className={styles.row}>
      {n < 10 && (
        <p className={`warn-banner ${styles.caveat}`}>
          Only {n} match{n === 1 ? "" : "es"} played so far — too small a sample for these
          scores to be statistically meaningful.
        </p>
      )}
      <div className={styles.stat}>
        <div className={styles.label}>Brier score</div>
        <span className={styles.value}>{brier.toFixed(3)}</span>
        <span className="muted"> · 0 = perfect, ~0.667 = coin-flip guess</span>
      </div>
      <div className={styles.stat}>
        <div className={styles.label}>Log loss</div>
        <span className={styles.value}>{logLoss.toFixed(3)}</span>
        <span className="muted"> · 0 = perfect, ~1.099 = coin-flip guess</span>
      </div>
      <p className={`muted ${styles.caption}`}>
        Computed over {n} played match{n === 1 ? "" : "es"}, each scored against its{" "}
        <em>pre-tournament</em> prediction — not the live, continuously-conditioned one, which
        would already have absorbed the very result being scored.
      </p>
    </div>
  );
}
