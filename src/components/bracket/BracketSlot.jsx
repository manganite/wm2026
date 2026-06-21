import { TeamLabel } from "../common/TeamLabel.jsx";
import { ProbBar } from "../common/ProbBar.jsx";
import styles from "./KnockoutBracket.module.css";

// One side of a bracket match: a resolved team (TeamLabel), or — when the
// slot's occupant isn't concretely known yet — a muted description ("Group A
// winner") plus a breakdown of which teams the simulation has advancing into
// it and how often (`advancement`, from runMonteCarlo's `slotAdvancement` —
// the brief's "advancement probabilities feeding" unfilled slots). `score`
// is shown only for played matches; `isWinner` highlights the side that the
// engine's own resolveWinnerToken/score comparison says advanced.
export function BracketSlot({ code, label, via, teamsByCode, score, isWinner, advancement }) {
  return (
    <div className={`${styles.slot} ${isWinner ? styles.winner : ""}`}>
      <div className={styles.slotRow}>
        <span className={styles.slotName}>
          {code ? <TeamLabel code={code} teamsByCode={teamsByCode} compact /> : <span className="muted">{label}</span>}
        </span>
        {score != null && <span className={styles.slotScore}>{score}</span>}
      </div>
      {code && <div className={`muted ${styles.via}`}>via {via}</div>}
      {!code && advancement?.length > 0 && (
        <ul className={styles.advancement}>
          {advancement.map(({ code: c, prob }) => (
            <li key={c} className={styles.advancementRow}>
              <span className={styles.advancementName}>
                <TeamLabel code={c} teamsByCode={teamsByCode} compact />
              </span>
              <ProbBar value={prob} decimals={0} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
