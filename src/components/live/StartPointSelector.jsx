import { START_POINTS } from "../../lib/selectors.js";
import styles from "./StartPointSelector.module.css";

export function StartPointSelector({ value, onChange }) {
  const real = START_POINTS.filter((p) => !p.projected);
  const projected = START_POINTS.filter((p) => p.projected);

  const renderButton = (p) => (
    <button
      key={p.id}
      className={`${styles.tab} ${value === p.id ? styles.active : ""}`}
      onClick={() => onChange(p.id)}
    >
      {p.label}
    </button>
  );

  return (
    <div className={styles.tabs}>
      {real.map(renderButton)}
      <span className={styles.separator}>Projected from:</span>
      {projected.map(renderButton)}
    </div>
  );
}
