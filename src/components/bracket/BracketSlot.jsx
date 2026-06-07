import { TeamLabel } from "../common/TeamLabel.jsx";
import styles from "./KnockoutBracket.module.css";

// One side of a bracket match: a resolved team (TeamLabel), or — when the
// slot's occupant isn't concretely known yet — a muted description like
// "Group A winner". `score` is shown only for played matches; `isWinner`
// highlights the side that the engine's own resolveWinnerToken/score
// comparison says advanced.
export function BracketSlot({ code, label, teamsByCode, score, isWinner }) {
  return (
    <div className={`${styles.slot} ${isWinner ? styles.winner : ""}`}>
      <span className={styles.slotName}>
        {code ? <TeamLabel code={code} teamsByCode={teamsByCode} /> : <span className="muted">{label}</span>}
      </span>
      {score != null && <span className={styles.slotScore}>{score}</span>}
    </div>
  );
}
