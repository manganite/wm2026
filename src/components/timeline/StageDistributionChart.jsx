import { useMemo, useRef, useState } from "react";
import { stageBoundaries, matchesOnDate } from "../../lib/timeline.js";
import { SEGMENTS, segmentsFor } from "../../lib/stageSegments.js";
import { buildXScale, buildXScaleAdaptive, clusterStageMarkers, formatPointDate, resolveMatchTeams } from "./chartUtils.js";
import { TeamLabel } from "../common/TeamLabel.jsx";
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

function fmtPct(v) {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtDelta(v) {
  const pp = v * 100;
  const sign = pp > 0 ? "+" : "";
  return `${sign}${pp.toFixed(1)}pp`;
}

// V3: for one team, how its probability mass is distributed across "ends in
// groups / R32 / R16 / ... / Champion" — a stacked area echoing
// ProgressionChart's bars, but evolving over the timeline instead of frozen
// "now". Mass moves from "Out in groups" toward "Champion" as that team wins.
export function StageDistributionChart({ points, teams, fixtures, results, resolution, defaultCode }) {
  const [code, setCode] = useState(defaultCode);
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);

  const teamsByCode = useMemo(() => Object.fromEntries(teams.map((t) => [t.code, t])), [teams]);
  const sortedTeams = useMemo(() => teams.slice().sort((a, b) => a.name.localeCompare(b.name)), [teams]);

  const last = points[points.length - 1];
  const boundaries = useMemo(() => stageBoundaries(fixtures), [fixtures]);
  const xOf = useMemo(
    () => buildXScaleAdaptive(boundaries.groupsStart, boundaries.F, last.date, INNER_W),
    [boundaries, last.date]
  );
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
  const hoverSegs = hoverPoint ? segmentsFor(hoverPoint.probs[code]) : null;
  const prevSegs = prevPoint ? segmentsFor(prevPoint.probs[code]) : null;

  const tooltipPct = hoverPoint
    ? Math.min(85, Math.max(15, ((xOf(hoverPoint.date) + MARGIN.left) / WIDTH) * 100))
    : null;

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

            {points.length === 1
              ? cumByPoint[0].map((seg) => (
                  <rect
                    key={seg.key}
                    x={xOf(points[0].date) - 12}
                    y={yOf(seg.upper)}
                    width={24}
                    height={yOf(seg.lower) - yOf(seg.upper)}
                    fill={seg.color}
                    className={styles.band}
                  />
                ))
              : SEGMENTS.map((seg, segIdx) => {
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
                {hoverSegs.map((seg, i) => {
                  const delta = prevSegs ? seg.value - prevSegs[i].value : null;
                  return (
                    <tr key={seg.key}>
                      <td>
                        <span className={styles.swatch} style={{ background: seg.color }} />
                        {seg.label}
                      </td>
                      <td className={styles.tooltipValue}>{fmtPct(seg.value)}</td>
                      {delta !== null && (
                        <td className={styles.tooltipDelta}>{fmtDelta(delta)}</td>
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
