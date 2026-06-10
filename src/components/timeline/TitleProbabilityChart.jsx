import { useMemo, useRef, useState } from "react";
import { stageBoundaries, matchesOnDate } from "../../lib/timeline.js";
import { assignTeamColors, FIELD_CODE } from "../../lib/teamColors.js";
import { TeamLabel } from "../common/TeamLabel.jsx";
import { buildXScale, clusterStageMarkers, linePath, formatPointDate, resolveMatchTeams } from "./chartUtils.js";
import styles from "./TitleProbabilityChart.module.css";

const WIDTH = 900;
const HEIGHT = 360;
const MARGIN = { top: 16, right: 16, bottom: 30, left: 44 };
const INNER_W = WIDTH - MARGIN.left - MARGIN.right;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom;

const DEFAULT_TOP_N = 8;
// Capped at the palette size (teamColors.js) so expanded teams never reuse a
// color already shown for one of the default top 8.
const EXPANDED_TOP_N = 12;

// y-axis is fixed 0-100% — the story this chart tells (Field shrinking from
// ~90% toward 0% while a handful of teams' lines climb toward 100%) only
// reads correctly on a fixed scale.
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1];

const STAGE_MARKERS = [
  { key: "groupsEnd", label: "Groups end" },
  { key: "R32", label: "R32" },
  { key: "R16", label: "R16" },
  { key: "QF", label: "QF" },
  { key: "SF", label: "SF" },
];

function fmtPct(v) {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtDelta(v) {
  const pp = v * 100;
  const sign = pp > 0 ? "+" : "";
  return `${sign}${pp.toFixed(1)}pp`;
}

// V1: how each visible team's title probability evolves across the timeline,
// plus a "Field" line for everything outside the shown set. Hover/tap a date
// to see what was played that day and how it moved the lines.
export function TitleProbabilityChart({ points, teams, fixtures, results, resolution }) {
  const [expanded, setExpanded] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);

  const teamsByCode = useMemo(() => Object.fromEntries(teams.map((t) => [t.code, t])), [teams]);
  const last = points[points.length - 1];

  const sortedCodes = useMemo(
    () => teams.map((t) => t.code).sort((a, b) => last.probs[b].W - last.probs[a].W),
    [teams, last]
  );

  const topN = expanded ? EXPANDED_TOP_N : DEFAULT_TOP_N;
  const visibleCodes = sortedCodes.slice(0, topN);
  const colors = useMemo(() => assignTeamColors(sortedCodes.slice(0, EXPANDED_TOP_N)), [sortedCodes]);

  const boundaries = useMemo(() => stageBoundaries(fixtures), [fixtures]);
  const xOf = useMemo(() => buildXScale(boundaries, INNER_W), [boundaries]);
  const yOf = (v) => INNER_H - v * INNER_H;

  const fieldValue = (p) => Math.max(0, 1 - visibleCodes.reduce((sum, c) => sum + p.probs[c].W, 0));

  function handleMouseMove(e) {
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * WIDTH - MARGIN.left;
    let nearest = 0;
    let best = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(xOf(p.date) - px);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setHoverIdx(nearest);
  }

  const hoverPoint = hoverIdx !== null ? points[hoverIdx] : null;
  const prevPoint = hoverIdx !== null && hoverIdx > 0 ? points[hoverIdx - 1] : null;
  const hoverMatches = hoverPoint ? matchesOnDate(fixtures, results, hoverPoint.date) : [];

  const tooltipPct = hoverPoint
    ? Math.min(85, Math.max(15, ((xOf(hoverPoint.date) + MARGIN.left) / WIDTH) * 100))
    : null;

  return (
    <div>
      <div className={styles.chartArea}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className={styles.svg}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {Y_TICKS.map((f) => (
              <g key={f}>
                <line x1={0} x2={INNER_W} y1={yOf(f)} y2={yOf(f)} className={styles.gridline} />
                <text x={-8} y={yOf(f)} className={styles.axisLabel} textAnchor="end" dominantBaseline="middle">
                  {Math.round(f * 100)}%
                </text>
              </g>
            ))}

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

            <line
              x1={xOf(last.date)}
              x2={xOf(last.date)}
              y1={0}
              y2={INNER_H}
              className={styles.nowLine}
            />
            <text x={xOf(last.date)} y={INNER_H + 16} className={styles.nowLabel} textAnchor="middle">
              Now
            </text>

            <path d={linePath(points, xOf, yOf, fieldValue)} className={styles.fieldLine} stroke={colors[FIELD_CODE]} />

            {visibleCodes.map((code) => (
              <path
                key={code}
                d={linePath(points, xOf, yOf, (p) => p.probs[code].W)}
                className={styles.line}
                stroke={colors[code]}
              />
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
            {hoverMatches.length > 0 && (
              <ul className={styles.tooltipMatches}>
                {hoverMatches.map((m) => {
                  const { home, away } = resolveMatchTeams(m, resolution);
                  const [gh, ga] = m.result;
                  return (
                    <li key={m.id}>
                      <TeamLabel code={home} teamsByCode={teamsByCode} /> {gh}:{ga}{" "}
                      <TeamLabel code={away} teamsByCode={teamsByCode} />
                    </li>
                  );
                })}
              </ul>
            )}
            <table className={styles.tooltipTable}>
              <tbody>
                {[...visibleCodes, FIELD_CODE].map((code) => {
                  const value = code === FIELD_CODE ? fieldValue(hoverPoint) : hoverPoint.probs[code].W;
                  const prevValue = prevPoint
                    ? code === FIELD_CODE
                      ? fieldValue(prevPoint)
                      : prevPoint.probs[code].W
                    : null;
                  return (
                    <tr key={code}>
                      <td>
                        <span className={styles.swatch} style={{ background: colors[code] }} />
                        {code === FIELD_CODE ? "Field" : <TeamLabel code={code} teamsByCode={teamsByCode} />}
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
        {[...visibleCodes, FIELD_CODE].map((code) => (
          <span className={styles.legendItem} key={code}>
            <span className={styles.swatch} style={{ background: colors[code] }} />
            {code === FIELD_CODE ? "Field (other teams)" : <TeamLabel code={code} teamsByCode={teamsByCode} />}
          </span>
        ))}
      </div>

      {sortedCodes.length > DEFAULT_TOP_N && (
        <div className={styles.footer}>
          <button className={styles.expandBtn} onClick={() => setExpanded((e) => !e)}>
            {expanded ? `Show top ${DEFAULT_TOP_N}` : `Show top ${EXPANDED_TOP_N}`}
          </button>
        </div>
      )}
    </div>
  );
}
