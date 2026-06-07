import { START_POINTS } from "../../lib/selectors.js";
import styles from "./StartPointSelector.module.css";

// v1 offers Pre-tournament vs. After-group-stage (projected) only — see
// lib/selectors.js for why deeper knockout-stage projection is a documented
// follow-up rather than built now (it would require propagating synthetic
// results stage-by-stage through the bracket).
export function StartPointSelector({ value, onChange }) {
  return (
    <div className={styles.tabs}>
      {START_POINTS.map((p) => (
        <button
          key={p.id}
          className={`${styles.tab} ${value === p.id ? styles.active : ""}`}
          onClick={() => onChange(p.id)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
