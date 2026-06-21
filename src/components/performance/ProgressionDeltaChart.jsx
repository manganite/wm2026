import { useMemo, useState } from "react";
import { TeamLabel } from "../common/TeamLabel.jsx";
import styles from "./ProgressionDeltaChart.module.css";

const DEFAULT_VISIBLE = 16;

const STAGE_LABELS = { R32: "R32", R16: "R16", QF: "QF", SF: "SF", F: "Final", W: "Win" };

function fmtDelta(v) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}`;
}

function fmtPct(v) {
  return `${(v * 100).toFixed(0)}%`;
}

export function ProgressionDeltaChart({ progressionData, teams }) {
  const [expanded, setExpanded] = useState(false);
  const [hoveredCode, setHoveredCode] = useState(null);
  const teamsByCode = useMemo(() => Object.fromEntries(teams.map((t) => [t.code, t])), [teams]);

  const sorted = useMemo(
    () => [...progressionData].sort((a, b) => b.delta - a.delta),
    [progressionData]
  );

  if (progressionData.length === 0) {
    return <p className="muted">No matches played yet — this fills in as results are entered.</p>;
  }

  const visible = expanded ? sorted : sorted.slice(0, DEFAULT_VISIBLE);
  const maxAbs = Math.max(...sorted.map((e) => Math.abs(e.delta)), 0.1);

  const hoveredEntry = hoveredCode ? sorted.find((e) => e.code === hoveredCode) : null;

  return (
    <div>
      <div className={styles.chart}>
        {visible.map((entry) => {
          const pct = (Math.abs(entry.delta) / maxAbs) * 50;
          const isPositive = entry.delta >= 0;
          const isEliminated = entry.status === "eliminated";
          const isPending = entry.status === "pending";

          return (
            <div
              className={styles.row}
              key={entry.code}
              onMouseEnter={() => setHoveredCode(entry.code)}
              onMouseLeave={() => setHoveredCode(null)}
            >
              <div className={styles.name}>
                <TeamLabel code={entry.code} teamsByCode={teamsByCode} />
              </div>
              <div className={styles.barContainer}>
                <div className={styles.barLeft}>
                  {!isPositive && (
                    <div
                      className={`${styles.barNeg} ${!isEliminated ? styles.provisional : ""}`}
                      style={{ width: `${pct}%` }}
                    />
                  )}
                </div>
                <div className={styles.center} />
                <div className={styles.barRight}>
                  {isPositive && (
                    <div
                      className={`${styles.barPos} ${!isEliminated ? styles.provisional : ""}`}
                      style={{ width: `${pct}%` }}
                    />
                  )}
                </div>
              </div>
              <div className={styles.meta}>
                <span className={styles.value}>{fmtDelta(entry.delta)}</span>
                {isEliminated && <span className={styles.statusElim}>out</span>}
                {isPending && <span className={styles.statusPending}>pending</span>}
                {!isEliminated && !isPending && <span className={styles.statusAlive}>in</span>}
              </div>
            </div>
          );
        })}
      </div>

      {sorted.length > DEFAULT_VISIBLE && (
        <button className={styles.expandBtn} onClick={() => setExpanded((e) => !e)}>
          {expanded ? `Show top ${DEFAULT_VISIBLE}` : `Show all ${sorted.length} teams`}
        </button>
      )}

      {hoveredEntry && (
        <div className={styles.tooltip}>
          <div className={styles.tooltipTitle}>
            <TeamLabel code={hoveredEntry.code} teamsByCode={teamsByCode} />
            {" — "}
            {hoveredEntry.furthestStage}
            {hoveredEntry.status !== "eliminated" && " (still in)"}
          </div>
          <div className={styles.tooltipGrid}>
            <div>
              <span className={styles.tooltipLabel}>Actual depth</span>
              <span className={styles.tooltipValue}>{hoveredEntry.actualDepth}</span>
            </div>
            <div>
              <span className={styles.tooltipLabel}>Expected depth</span>
              <span className={styles.tooltipValue}>{hoveredEntry.expDepth.toFixed(2)}</span>
            </div>
            <div>
              <span className={styles.tooltipLabel}>Delta</span>
              <span className={styles.tooltipValue}>{fmtDelta(hoveredEntry.delta)}</span>
            </div>
          </div>
          <table className={styles.tooltipTable}>
            <thead>
              <tr>
                {Object.entries(STAGE_LABELS).map(([k, label]) => (
                  <th key={k}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {Object.keys(STAGE_LABELS).map((k) => (
                  <td key={k} className="mono">{fmtPct(hoveredEntry.reachProbs[k])}</td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: "11px", margin: "6px 0 0" }}>
            Pre-tournament reach probabilities. Expected depth = sum = {hoveredEntry.expDepth.toFixed(2)}.
          </p>
        </div>
      )}
    </div>
  );
}
