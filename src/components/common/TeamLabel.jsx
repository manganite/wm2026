import styles from "./TeamLabel.module.css";

export function TeamLabel({ code, teamsByCode, showCode = false, showConfed = false, compact = false }) {
  if (!code) return <span className="muted">TBD</span>;
  const team = teamsByCode[code];
  if (!team) return <span className="mono">{code}</span>;

  if (compact) {
    return (
      <span className={styles.label} title={team.name}>
        <span className={styles.fullName}>{team.name}</span>
        <span className={styles.compactName}>{team.code}</span>
      </span>
    );
  }

  return (
    <span className={styles.label}>
      <span>{team.name}</span>
      {showCode && <span className={styles.code}>{team.code}</span>}
      {showConfed && <span className={styles.confed}>{team.confed}</span>}
    </span>
  );
}
