import { useMemo, useRef, useState } from "react";
import { T0, stageBoundaries } from "../../lib/timeline.js";
import { TeamLabel } from "../common/TeamLabel.jsx";
import { buildXScaleForRange, linePath, formatPointDate } from "./chartUtils.js";
import styles from "./GroupQualificationCharts.module.css";

const WIDTH = 260;
const HEIGHT = 150;
const MARGIN = { top: 10, right: 8, bottom: 8, left: 28 };
const INNER_W = WIDTH - MARGIN.left - MARGIN.right;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom;

const Y_TICKS = [0, 0.5, 1];
const PALETTE = ["#1d4ed8", "#dc2626", "#16a34a", "#ea580c"];

function fmtPct(v) {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtDelta(v) {
  const pp = v * 100;
  const sign = pp > 0 ? "+" : "";
  return `${sign}${pp.toFixed(1)}pp`;
}

function GroupPanel({ group, members, groupPoints, xOf, yOf, lastPoint }) {
  const svgRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  function handleMouseMove(e) {
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * WIDTH - MARGIN.left;
    let nearest = 0;
    let best = Infinity;
    groupPoints.forEach((p, i) => {
      const d = Math.abs(xOf(p.date) - px);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setHoverIdx(nearest);
  }

  const hoverPoint = hoverIdx !== null ? groupPoints[hoverIdx] : null;
  const prevPoint = hoverIdx !== null && hoverIdx > 0 ? groupPoints[hoverIdx - 1] : null;

  const tooltipPct = hoverPoint
    ? Math.min(80, Math.max(20, ((xOf(hoverPoint.date) + MARGIN.left) / WIDTH) * 100))
    : null;

  return (
    <div className={styles.panel}>
      <div className={styles.title}>Group {group}</div>
      <div className={styles.chartArea}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className={styles.svg}
          role="img"
          aria-label={`Group ${group} qualification — ${members.map((t) => `${t.name} ${(lastPoint.probs[t.code].R32 * 100).toFixed(0)}%`).join(", ")}`}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <title>Group {group} qualification races</title>
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            <rect x={0} y={0} width={INNER_W} height={INNER_H} fill="transparent" />
            {Y_TICKS.map((f) => (
              <g key={f} aria-hidden="true">
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
            {hoverPoint && (
              <line
                x1={xOf(hoverPoint.date)}
                x2={xOf(hoverPoint.date)}
                y1={0}
                y2={INNER_H}
                className={styles.hoverLine}
              />
            )}
          </g>
        </svg>

        {hoverPoint && (
          <div className={styles.tooltip} style={{ left: `${tooltipPct}%` }}>
            <div className={styles.tooltipDate}>{formatPointDate(hoverPoint.date)}</div>
            <table className={styles.tooltipTable}>
              <tbody>
                {members.map((t, i) => {
                  const value = hoverPoint.probs[t.code].R32;
                  const prevValue = prevPoint ? prevPoint.probs[t.code].R32 : null;
                  return (
                    <tr key={t.code}>
                      <td>
                        <span className={styles.tooltipSwatch} style={{ background: PALETTE[i % PALETTE.length] }} />
                        <TeamLabel code={t.code} teamsByCode={{ [t.code]: t }} />
                      </td>
                      <td className={styles.tooltipValue}>{fmtPct(value)}</td>
                      {prevValue !== null && (
                        <td className={styles.tooltipDelta}>{fmtDelta(value - prevValue)}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className={styles.legend}>
        {members.map((t, i) => (
          <span className={styles.legendItem} key={t.code}>
            <span className={styles.swatch} style={{ background: PALETTE[i % PALETTE.length] }} />
            <TeamLabel code={t.code} teamsByCode={{ [t.code]: t }} />
          </span>
        ))}
      </div>
    </div>
  );
}

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
            <GroupPanel
              key={group}
              group={group}
              members={members}
              groupPoints={groupPoints}
              xOf={xOf}
              yOf={yOf}
              lastPoint={lastPoint}
            />
          ))}
        </div>
      )}
    </div>
  );
}
