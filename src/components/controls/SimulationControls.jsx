import { MAX_RUNS } from "../../config.js";
import styles from "./SimulationControls.module.css";

const RUN_OPTIONS = [5_000, 15_000, 30_000, 60_000, MAX_RUNS];

// Lets the user trade off precision for speed: more simulated tournaments
// narrow the Monte-Carlo sampling noise on every probability shown, at the
// cost of a longer (still off-main-thread, via useSimulation's worker) run.
// Re-simulation is automatic — useSimulation re-posts to the worker whenever
// `runs` (or the conditioning results) changes, so there's no "Run" button.
export function SimulationControls({ runs, onRunsChange, status }) {
  return (
    <div className={styles.row}>
      <label className={styles.label}>
        Simulated tournaments
        <select value={runs} onChange={(e) => onRunsChange(Number(e.target.value))}>
          {RUN_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n.toLocaleString()}
            </option>
          ))}
        </select>
      </label>
      <span className="muted">
        {status === "running"
          ? "Running…"
          : "More simulated tournaments reduce sampling noise, at the cost of a longer run."}
      </span>
    </div>
  );
}
