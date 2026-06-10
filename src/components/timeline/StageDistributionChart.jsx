import { useMemo, useState } from "react";
import { stageBoundaries } from "../../lib/timeline.js";
import { SEGMENTS, segmentsFor } from "../../lib/stageSegments.js";
import { buildXScale, clusterStageMarkers } from "./chartUtils.js";
import styles from "./StageDistributionChart.module.css";

const WIDTH = 900;
const HEIGHT = 320;
const MARGIN = { top: 16, right: 16, bottom: 30, left: 36 };
const INNER_W = WIDTH - MARGIN.left - MARGIN.right;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom;

const Y_TICKS = [0, 0.5, 1];

const STAGE_MARKERS = [
  { key: "groupsEnd", label: "Groups end" },
  { key: "R32", label: "R32" },
  { key: "R16", label: "R16" },
  { key: "QF", label: "QF" },
  { key: "SF", label: "SF" },
];

// V3: for one team, how its probability mass is distributed across "ends in
// groups / R32 / R16 / ... / Champion" — a stacked area echoing
// ProgressionChart's bars, but evolving over the timeline instead of frozen
// "now". Mass moves from "Out in groups" toward "Champion" as that team wins.
export function StageDistributionChart({ points, teams, fixtures, defaultCode }) {
  const [code, setCode] = useState(defaultCode);

  const sortedTeams = useMemo(() => teams.slice().sort((a, b) => a.name.localeCompare(b.name)), [teams]);

  const boundaries = useMemo(() => stageBoundaries(fixtures), [fixtures]);
  const xOf = useMemo(() => buildXScale(boundaries, INNER_W), [boundaries]);
  const yOf = (v) => INNER_H - v * INNER_H;

  const cumByPoint = useMemo(() => {
    return points.map((p) => {
      let acc = 0;
      return segmentsFor(p.probs[code]).map((s) => {
        const lower = acc;
        acc += s.value;
        return { ...s, lower, upper: acc };
      });
    });
  }, [points, code]);

  const last = points[points.length - 1];

  return (
    <div>
      <div className={styles.controls}>
        <label>
          Team:{" "}
          <select value={code} onChange={(e) => setCode(e.target.value)} className={styles.select}>
            {sortedTeams.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.chartArea}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={styles.svg}>
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {Y_TICKS.map((f) => (
              <g key={f}>
                <line x1={0} x2={INNER_W} y1={yOf(f)} y2={yOf(f)} className={styles.gridline} />
                <text x={-8} y={yOf(f)} className={styles.axisLabel} textAnchor="end" dominantBaseline="middle">
                  {Math.round(f * 100)}%
                </text>
              </g>
            ))}

            {SEGMENTS.map((seg, segIdx) => {
              const top = points
                .map(
                  (p, i) =>
                    `${i === 0 ? "M" : "L"}${xOf(p.date).toFixed(2)},${yOf(cumByPoint[i][segIdx].upper).toFixed(2)}`
                )
                .join(" ");
              const bottom = points
                .slice()
                .reverse()
                .map((p, ri) => {
                  const i = points.length - 1 - ri;
                  return `L${xOf(p.date).toFixed(2)},${yOf(cumByPoint[i][segIdx].lower).toFixed(2)}`;
                })
                .join(" ");
              return <path key={seg.key} d={`${top} ${bottom} Z`} fill={seg.color} className={styles.band} />;
            })}

            {clusterStageMarkers(STAGE_MARKERS, boundaries, xOf).map((cluster) => (
              <g key={cluster.label}>
                {cluster.lines.map((x) => (
                  <line key={x} x1={x} x2={x} y1={0} y2={INNER_H} className={styles.stageLine} />
                ))}
                <text x={cluster.x} y={-4} className={styles.stageLabel} textAnchor="middle">
                  {cluster.label}
                </text>
              </g>
            ))}

            <line x1={xOf(last.date)} x2={xOf(last.date)} y1={0} y2={INNER_H} className={styles.nowLine} />
            <text x={xOf(last.date)} y={INNER_H + 16} className={styles.nowLabel} textAnchor="middle">
              Now
            </text>
          </g>
        </svg>
      </div>

      <div className={styles.legend}>
        {SEGMENTS.map((s) => (
          <span className={styles.legendItem} key={s.key}>
            <span className={styles.swatch} style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
