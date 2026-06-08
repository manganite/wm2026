import { TeamLabel } from "../common/TeamLabel.jsx";
import { MatchPrediction } from "../prediction/MatchPrediction.jsx";
import styles from "./FixtureRow.module.css";

// One fixture: played matches show the actual score behind a "fixed" badge
// (so they read as conditioned-on, not simulated); unplayed-but-resolvable
// matches embed the shared MatchPrediction; fully unresolved knockout slots
// show their description ("Group A winner" etc) — never a fabricated score.
export function FixtureRow({ row, teamsByCode }) {
  const { id, home, away, played, score, shootoutWinner, prediction } = row;

  const sideLabel = (side) =>
    side.code ? (
      <TeamLabel code={side.code} teamsByCode={teamsByCode} />
    ) : (
      <span className="muted">{side.label}</span>
    );

  return (
    <div className={styles.row}>
      <div className={styles.head}>
        <span className={styles.id}>{id}</span>
        <div className={styles.matchup}>
          {sideLabel(home)}
          <span className={styles.vs}>vs</span>
          {sideLabel(away)}
        </div>

        {played ? (
          <>
            <span className={styles.score}>
              {score[0]}:{score[1]}
            </span>
            {shootoutWinner && (
              <span className={styles.shootout}>
                <TeamLabel code={shootoutWinner} teamsByCode={teamsByCode} /> won on penalties
              </span>
            )}
            <span className="fixed-badge" title="Conditioned on the entered result — not simulated">
              ✓ fixed
            </span>
          </>
        ) : !prediction ? (
          <span className={styles.tbd}>Participants not yet determined</span>
        ) : null}
      </div>

      {!played && prediction && (
        <div className={styles.predictionWrap}>
          <MatchPrediction prediction={prediction} homeCode={home.code} awayCode={away.code} />
        </div>
      )}
    </div>
  );
}
