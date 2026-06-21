import { useMemo, useState } from "react";
import { TeamLabel } from "../common/TeamLabel.jsx";
import styles from "./ProgressionDeltaChart.module.css";

const STAGE_LABELS = { R32: "R32", R16: "R16", QF: "QF", SF: "SF", F: "Final", W: "Win" };

function fmtDelta(v) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}`;
}

function fmtPct(v) {
  return `${(v * 100).toFixed(0)}%`;
}

function RowBar({ entry, maxAbs, onHover, styles }) {
  const pct = (Math.abs(entry.delta) / maxAbs) * 50;
  const isPositive = entry.delta >= 0;
  const isDecided = entry.status === "eliminated" || entry.actualDepth >= 1;

  return (
    <div
      className={styles.row}
      onMouseEnter={() => onHover(entry.code)}
      onMouseLeave={() => onHover(null)}
    >
      <div className={styles.name}>
        <TeamLabel code={entry.code} teamsByCode={entry._teamsByCode} />
      </div>
      <div className={styles.barContainer}>
        <div className={styles.barLeft}>
          {!isPositive && (
            <div
              className={`${styles.barNeg} ${!isDecided ? styles.provisional : ""}`}
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
        <div className={styles.center} />
        <div className={styles.barRight}>
          {isPositive && (
            <div
              className={`${styles.barPos} ${!isDecided ? styles.provisional : ""}`}
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
      </div>
      <div className={styles.meta}>
        <span className={styles.value}>{fmtDelta(entry.delta)}</span>
        {entry.status === "eliminated" && <span className={styles.statusElim}>out</span>}
        {entry.status === "pending" && <span className={styles.statusPending}>pending</span>}
        {entry.status === "alive" && entry.actualDepth >= 1 && <span className={styles.statusClinched}>advanced</span>}
        {entry.status === "alive" && entry.actualDepth === 0 && <span className={styles.statusAlive}>in</span>}
      </div>
    </div>
  );
}

export function ProgressionDeltaChart({ progressionData, teams }) {
  const [expandedDecided, setExpandedDecided] = useState(false);
  const [expandedUndecided, setExpandedUndecided] = useState(false);
  const [hoveredCode, setHoveredCode] = useState(null);
  const teamsByCode = useMemo(() => Object.fromEntries(teams.map((t) => [t.code, t])), [teams]);

  const { decided, undecided } = useMemo(() => {
    const decided = [];
    const undecided = [];
    for (const entry of progressionData) {
      const isDecided = entry.status === "eliminated" || entry.actualDepth >= 1;
      (isDecided ? decided : undecided).push({ ...entry, _teamsByCode: teamsByCode });
    }
    decided.sort((a, b) => b.delta - a.delta);
    undecided.sort((a, b) => b.delta - a.delta);
    return { decided, undecided };
  }, [progressionData, teamsByCode]);

  if (progressionData.length === 0) {
    return <p className="muted">No matches played yet — this fills in as results are entered.</p>;
  }

  const allEntries = [...decided, ...undecided];
  const maxAbs = Math.max(...allEntries.map((e) => Math.abs(e.delta)), 0.1);

  const hoveredEntry = hoveredCode ? allEntries.find((e) => e.code === hoveredCode) : null;

  const visibleDecided = expandedDecided ? decided : decided.slice(0, 12);
  const visibleUndecided = expandedUndecided ? undecided : undecided.slice(0, 10);

  return (
    <div>
      {decided.length > 0 && (
        <>
          <div className={styles.sectionLabel}>Decided — advanced or eliminated</div>
          <div className={styles.chart}>
            {visibleDecided.map((entry) => (
              <RowBar key={entry.code} entry={entry} maxAbs={maxAbs} onHover={setHoveredCode} styles={styles} />
            ))}
          </div>
          {decided.length > 12 && (
            <button className={styles.expandBtn} onClick={() => setExpandedDecided((e) => !e)}>
              {expandedDecided ? "Show fewer" : `Show all ${decided.length} decided`}
            </button>
          )}
        </>
      )}

      {undecided.length > 0 && (
        <>
          <div className={`${styles.sectionLabel} ${styles.sectionLabelSecondary}`}>
            Still in — provisional
          </div>
          <div className={styles.chart}>
            {visibleUndecided.map((entry) => (
              <RowBar key={entry.code} entry={entry} maxAbs={maxAbs} onHover={setHoveredCode} styles={styles} />
            ))}
          </div>
          {undecided.length > 10 && (
            <button className={styles.expandBtn} onClick={() => setExpandedUndecided((e) => !e)}>
              {expandedUndecided ? "Show fewer" : `Show all ${undecided.length} undecided`}
            </button>
          )}
        </>
      )}

      {decided.length === 0 && (
        <p className={`muted ${styles.earlyNote}`}>
          No teams have been eliminated or clinched advancement yet — progression deltas become
          fully meaningful as teams are knocked out and the tournament progresses.
        </p>
      )}

      {hoveredEntry && (
        <div className={styles.tooltip}>
          <div className={styles.tooltipTitle}>
            <TeamLabel code={hoveredEntry.code} teamsByCode={teamsByCode} />
            {" — "}
            {hoveredEntry.furthestStage}
            {hoveredEntry.status === "alive" && hoveredEntry.depth === 0 && " (still in)"}
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
