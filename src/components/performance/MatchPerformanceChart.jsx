import { useMemo, useState } from "react";
import { TeamLabel } from "../common/TeamLabel.jsx";
import styles from "./MatchPerformanceChart.module.css";

const DEFAULT_VISIBLE = 16;

const METRIC_OPTIONS = [
  { key: "gd", label: "Goal difference", scope: "all matches" },
  { key: "pts", label: "Points", scope: "group stage only" },
];

const NORM_OPTIONS = [
  { key: "perMatch", label: "Per match" },
  { key: "total", label: "Total" },
];

function fmtDelta(v) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}`;
}

function fmtGD(v) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}`;
}

export function MatchPerformanceChart({ teamPerformance, teams }) {
  const [metric, setMetric] = useState("gd");
  const [norm, setNorm] = useState("perMatch");
  const [expanded, setExpanded] = useState(false);
  const [hoveredCode, setHoveredCode] = useState(null);
  const teamsByCode = useMemo(() => Object.fromEntries(teams.map((t) => [t.code, t])), [teams]);

  const accessor = (entry) => {
    if (metric === "pts") return norm === "perMatch" ? entry.perMatchDeltaPts : entry.totalDeltaPts;
    return norm === "perMatch" ? entry.perMatchDeltaGD : entry.totalDeltaGD;
  };

  const filtered = useMemo(() => {
    let list = teamPerformance;
    if (metric === "pts") list = list.filter((e) => e.groupMatches > 0);
    return list.slice().sort((a, b) => accessor(b) - accessor(a));
  }, [teamPerformance, metric, norm]);

  if (teamPerformance.length === 0) {
    return <p className="muted">No matches played yet — this fills in as results are entered.</p>;
  }

  const visible = expanded ? filtered : filtered.slice(0, DEFAULT_VISIBLE);
  const maxAbs = Math.max(...filtered.map((e) => Math.abs(accessor(e))), 0.1);

  const hoveredEntry = hoveredCode ? teamPerformance.find((e) => e.code === hoveredCode) : null;

  return (
    <div>
      <div className={styles.controls}>
        <div className={styles.toggleGroup}>
          {METRIC_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              className={`${styles.toggleBtn} ${metric === opt.key ? styles.toggleBtnActive : ""}`}
              onClick={() => setMetric(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className={styles.toggleGroup}>
          {NORM_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              className={`${styles.toggleBtn} ${norm === opt.key ? styles.toggleBtnActive : ""}`}
              onClick={() => setNorm(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {metric === "pts" && (
          <span className={`muted ${styles.scopeNote}`}>Group stage only</span>
        )}
      </div>

      <div className={styles.chart}>
        {visible.map((entry) => {
          const val = accessor(entry);
          const pct = (Math.abs(val) / maxAbs) * 50;
          const isPositive = val >= 0;

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
                      className={styles.barNeg}
                      style={{ width: `${pct}%` }}
                    />
                  )}
                </div>
                <div className={styles.center} />
                <div className={styles.barRight}>
                  {isPositive && (
                    <div
                      className={styles.barPos}
                      style={{ width: `${pct}%` }}
                    />
                  )}
                </div>
              </div>
              <div className={styles.value}>{fmtDelta(val)}</div>
            </div>
          );
        })}
      </div>

      {filtered.length > DEFAULT_VISIBLE && (
        <button className={styles.expandBtn} onClick={() => setExpanded((e) => !e)}>
          {expanded ? `Show top ${DEFAULT_VISIBLE}` : `Show all ${filtered.length} teams`}
        </button>
      )}

      {hoveredEntry && (
        <div className={styles.tooltip}>
          <div className={styles.tooltipTitle}>
            <TeamLabel code={hoveredEntry.code} teamsByCode={teamsByCode} />
            {" — "}
            {hoveredEntry.matches} match{hoveredEntry.matches === 1 ? "" : "es"}
          </div>
          <table className={styles.tooltipTable}>
            <thead>
              <tr>
                <th>Opponent</th>
                <th>Score</th>
                <th>GD</th>
                <th>xGD</th>
                {metric === "pts" && <><th>Pts</th><th>xPts</th></>}
              </tr>
            </thead>
            <tbody>
              {hoveredEntry.matchRows.map((mr) => (
                <tr key={mr.id}>
                  <td><TeamLabel code={mr.opponent} teamsByCode={teamsByCode} /></td>
                  <td className="mono">{mr.goalsFor}:{mr.goalsAgainst}</td>
                  <td className="mono">{fmtGD(mr.actualGD)}</td>
                  <td className="mono">{fmtGD(mr.expGD)}</td>
                  {metric === "pts" && mr.actualPts != null && (
                    <>
                      <td className="mono">{mr.actualPts}</td>
                      <td className="mono">{mr.xPts.toFixed(1)}</td>
                    </>
                  )}
                  {metric === "pts" && mr.actualPts == null && (
                    <><td className="muted">—</td><td className="muted">—</td></>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
