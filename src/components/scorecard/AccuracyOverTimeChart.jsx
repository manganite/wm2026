import { useMemo } from "react";
import { brierTerm, logLossTerm } from "../../lib/accuracy.js";
import { stageBoundaries } from "../../lib/timeline.js";
import { buildXScaleAdaptive, clusterStageMarkers } from "../timeline/chartUtils.js";
import styles from "./AccuracyOverTimeChart.module.css";

const WIDTH = 900;
const HEIGHT = 240;
const MARGIN = { top: 16, right: 50, bottom: 30, left: 48 };
const INNER_W = WIDTH - MARGIN.left - MARGIN.right;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom;

const BRIER_RANDOM = 2 / 3;
const LOG_LOSS_RANDOM = Math.log(3);

const STAGE_MARKERS = [
  { key: "groupsEnd", label: "Groups end" },
  { key: "R32", label: "R32" },
  { key: "R16", label: "R16" },
  { key: "QF", label: "QF" },
  { key: "SF", label: "SF" },
];

function computeTimeSeries(matchDetails) {
  const sorted = [...matchDetails].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const dateOrder = [];
  const byDate = new Map();
  for (const row of sorted) {
    if (!row.date) continue;
    if (!byDate.has(row.date)) {
      byDate.set(row.date, []);
      dateOrder.push(row.date);
    }
    byDate.get(row.date).push(row);
  }

  let brierSum = 0;
  let logLossSum = 0;
  let n = 0;
  const cumulative = [];
  const daily = [];

  for (const date of dateOrder) {
    const rows = byDate.get(date);
    let dayBrier = 0;
    let dayLogLoss = 0;

    for (const row of rows) {
      const b = brierTerm(row.tendency, row.actualOutcome);
      const l = logLossTerm(row.tendency, row.actualOutcome);
      brierSum += b;
      logLossSum += l;
      dayBrier += b;
      dayLogLoss += l;
      n++;
    }

    cumulative.push({ date, brier: brierSum / n, logLoss: logLossSum / n, n });
    daily.push({ date, brier: dayBrier / rows.length, logLoss: dayLogLoss / rows.length, n: rows.length });
  }

  return { cumulative, daily };
}

function MetricChart({ cumulative, daily, accessor, baseline, label, boundaries, xOf }) {
  if (cumulative.length === 0) return null;

  const allValues = [...cumulative.map(accessor), ...daily.map(accessor), baseline];
  const yMax = Math.max(...allValues) * 1.1;
  const yOf = (v) => INNER_H - (v / yMax) * INNER_H;

  const yTicks = [];
  const step = yMax <= 1.2 ? 0.2 : 0.5;
  for (let v = 0; v <= yMax; v += step) yTicks.push(v);

  const cumPath = cumulative
    .map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.date).toFixed(2)},${yOf(accessor(p)).toFixed(2)}`)
    .join(" ");

  return (
    <div className={styles.chartWrap}>
      <h4 className={styles.chartTitle}>{label}</h4>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={styles.svg}>
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={0} x2={INNER_W} y1={yOf(t)} y2={yOf(t)} className={styles.gridline} />
              <text x={-8} y={yOf(t)} className={styles.axisLabel} textAnchor="end" dominantBaseline="middle">
                {t.toFixed(1)}
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
            x1={0}
            x2={INNER_W}
            y1={yOf(baseline)}
            y2={yOf(baseline)}
            className={styles.baselineLine}
          />
          <text
            x={INNER_W + 4}
            y={yOf(baseline)}
            className={styles.baselineLabel}
            dominantBaseline="middle"
          >
            random
          </text>

          {daily.map((p) => (
            <circle
              key={p.date}
              cx={xOf(p.date)}
              cy={yOf(accessor(p))}
              r={2.5}
              className={styles.dailyDot}
            />
          ))}

          <path d={cumPath} className={styles.cumLine} />

          {cumulative.map((p) => (
            <circle
              key={p.date}
              cx={xOf(p.date)}
              cy={yOf(accessor(p))}
              r={3}
              className={styles.cumDot}
            >
              <title>
                {p.date}: {accessor(p).toFixed(3)} ({p.n} matches)
              </title>
            </circle>
          ))}
        </g>
      </svg>
    </div>
  );
}

export function AccuracyOverTimeChart({ matchDetails, fixtures }) {
  const { cumulative, daily } = useMemo(
    () => computeTimeSeries(matchDetails),
    [matchDetails]
  );

  const boundaries = useMemo(() => stageBoundaries(fixtures), [fixtures]);

  const xOf = useMemo(() => {
    if (cumulative.length === 0) return () => 0;
    const lastDate = cumulative[cumulative.length - 1].date;
    return buildXScaleAdaptive(boundaries.groupsStart, boundaries.F, lastDate, INNER_W);
  }, [cumulative, boundaries]);

  if (matchDetails.length === 0) {
    return <p className="muted">No matches played yet — this fills in as results are entered.</p>;
  }

  return (
    <div>
      <MetricChart
        cumulative={cumulative}
        daily={daily}
        accessor={(p) => p.brier}
        baseline={BRIER_RANDOM}
        label="Brier score over time"
        boundaries={boundaries}
        xOf={xOf}
      />
      <MetricChart
        cumulative={cumulative}
        daily={daily}
        accessor={(p) => p.logLoss}
        baseline={LOG_LOSS_RANDOM}
        label="Log loss over time"
        boundaries={boundaries}
        xOf={xOf}
      />
      <p className={`muted ${styles.caption}`}>
        Solid line: cumulative score across all matches played up to each date (lower is better).
        Faint dots: that day's matches only (noisy). Dashed line: a uniform 1/3-1/3-1/3 random guess.
      </p>
    </div>
  );
}
