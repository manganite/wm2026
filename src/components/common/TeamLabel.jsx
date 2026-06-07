import styles from "./TeamLabel.module.css";

// Renders a team's name (+ optional code/confederation), looked up by code.
// `teamsByCode` is a plain { code -> team } map built once by the caller.
export function TeamLabel({ code, teamsByCode, showCode = false, showConfed = false }) {
  if (!code) return <span className="muted">TBD</span>;
  const team = teamsByCode[code];
  if (!team) return <span className="mono">{code}</span>;

  return (
    <span className={styles.label}>
      <span>{team.name}</span>
      {showCode && <span className={styles.code}>{team.code}</span>}
      {showConfed && <span className={styles.confed}>{team.confed}</span>}
    </span>
  );
}
