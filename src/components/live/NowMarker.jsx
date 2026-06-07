import styles from "./NowMarker.module.css";

const STAGE_LABELS = {
  group: "Group stage",
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-finals",
  SF: "Semi-finals",
  F: "Final",
  complete: "Tournament complete",
};

// Small status readout for "where the real tournament currently is", derived
// purely from which matches have entries in results.json (deriveTournamentProgress
// in lib/bracket.js) — i.e. it reflects entered results, not the simulation.
export function NowMarker({ progress }) {
  const { stage, played, total } = progress;
  const label = STAGE_LABELS[stage] ?? stage;

  return (
    <div className={styles.marker}>
      <span className={styles.dot} />
      <span>
        <strong>Now:</strong> {label}
        {stage !== "complete" && (
          <span className="muted">
            {" "}
            — {played} of {total} match{total === 1 ? "" : "es"} played
          </span>
        )}
      </span>
    </div>
  );
}
