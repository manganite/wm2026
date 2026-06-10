import { useMemo, useState } from "react";
import { T0, stageBoundaries } from "../../lib/timeline.js";
import { TeamLabel } from "../common/TeamLabel.jsx";
import { buildXScaleForRange, linePath } from "./chartUtils.js";
import styles from "./GroupQualificationCharts.module.css";

const WIDTH = 260;
const HEIGHT = 150;
const MARGIN = { top: 10, right: 8, bottom: 8, left: 28 };
const INNER_W = WIDTH - MARGIN.left - MARGIN.right;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom;

const Y_TICKS = [0, 0.5, 1];
const PALETTE = ["#1d4ed8", "#dc2626", "#16a34a", "#ea580c"];

// V4: for each group, its four teams' probability of advancing to the R32
// (probs[code].R32) across the group-stage portion of the timeline.
// Best-third uncertainty deliberately persists past a group's own last match
// — these lines don't snap to 0/1 until the slowest group finishes, which is
// the point of this view. Collapsed by default (12 small panels).
export function GroupQualificationCharts({ points, teams, fixtures }) {
  const [open, setOpen] = useState(false);

  const boundaries = useMemo(() => stageBoundaries(fixtures), [fixtures]);
  const groupPoints = useMemo(
    () => points.filter((p) => p.date === T0 || p.date <= boundaries.groupsEnd),
    [points, boundaries]
  );
  const xOf = useMemo(
    () => buildXScaleForRange(boundaries.groupsStart, boundaries.groupsEnd, INNER_W),
    [boundaries]
  );
  const yOf = (v) => INNER_H - v * INNER_H;

  const groups = useMemo(() => {
    const byGroup = {};
    for (const t of teams) (byGroup[t.group] ??= []).push(t);
    return Object.entries(byGroup)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([group, members]) => ({
        group,
        members: members.slice().sort((a, b) => a.code.localeCompare(b.code)),
      }));
  }, [teams]);

  const lastPoint = groupPoints[groupPoints.length - 1];

  return (
    <div>
      <button className={styles.toggle} onClick={() => setOpen((o) => !o)}>
        {open ? "Hide group qualification races" : "Show group qualification races"}
      </button>

      {open && (
        <div className={styles.grid}>
          {groups.map(({ group, members }) => (
            <div key={group} className={styles.panel}>
              <div className={styles.title}>Group {group}</div>
              <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={styles.svg}>
                <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                  {Y_TICKS.map((f) => (
                    <g key={f}>
                      <line x1={0} x2={INNER_W} y1={yOf(f)} y2={yOf(f)} className={styles.gridline} />
                      <text x={-6} y={yOf(f)} className={styles.axisLabel} textAnchor="end" dominantBaseline="middle">
                        {Math.round(f * 100)}%
                      </text>
                    </g>
                  ))}
                  {members.map((t, i) => (
                    <g key={t.code}>
                      <path
                        d={linePath(groupPoints, xOf, yOf, (p) => p.probs[t.code].R32)}
                        className={styles.line}
                        stroke={PALETTE[i % PALETTE.length]}
                      />
                      <circle
                        cx={xOf(lastPoint.date)}
                        cy={yOf(lastPoint.probs[t.code].R32)}
                        r={2.5}
                        fill={PALETTE[i % PALETTE.length]}
                      />
                    </g>
                  ))}
                </g>
              </svg>
              <div className={styles.legend}>
                {members.map((t, i) => (
                  <span className={styles.legendItem} key={t.code}>
                    <span className={styles.swatch} style={{ background: PALETTE[i % PALETTE.length] }} />
                    <TeamLabel code={t.code} teamsByCode={{ [t.code]: t }} />
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
