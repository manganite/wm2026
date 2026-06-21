import { useMemo } from "react";
import { OUTCOMES } from "../../lib/accuracy.js";
import styles from "./CalibrationChart.module.css";

const WIDTH = 400;
const HEIGHT = 400;
const MARGIN = { top: 16, right: 16, bottom: 40, left: 48 };
const INNER_W = WIDTH - MARGIN.left - MARGIN.right;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom;

const NUM_BINS = 10;
const BIN_WIDTH = 1 / NUM_BINS;
const TICKS = [0, 0.2, 0.4, 0.6, 0.8, 1.0];

function computeCalibrationData(matchDetails) {
  const bins = Array.from({ length: NUM_BINS }, () => ({ sumPred: 0, sumHit: 0, count: 0 }));

  for (const row of matchDetails) {
    for (const outcome of OUTCOMES) {
      const p = row.tendency[outcome];
      const hit = row.actualOutcome === outcome ? 1 : 0;
      const idx = Math.min(Math.floor(p / BIN_WIDTH), NUM_BINS - 1);
      bins[idx].sumPred += p;
      bins[idx].sumHit += hit;
      bins[idx].count++;
    }
  }

  const points = [];
  let eceSum = 0;
  let totalCount = 0;

  for (let i = 0; i < NUM_BINS; i++) {
    const b = bins[i];
    if (b.count === 0) continue;
    const meanPred = b.sumPred / b.count;
    const obsRate = b.sumHit / b.count;
    points.push({ meanPred, obsRate, count: b.count, binIdx: i });
    eceSum += b.count * Math.abs(meanPred - obsRate);
    totalCount += b.count;
  }

  const ece = totalCount > 0 ? eceSum / totalCount : 0;
  return { points, ece, totalCount };
}

export function CalibrationChart({ matchDetails }) {
  const { points, ece, totalCount } = useMemo(
    () => computeCalibrationData(matchDetails),
    [matchDetails]
  );

  if (matchDetails.length === 0) {
    return <p className="muted">No matches played yet — this fills in as results are entered.</p>;
  }

  const xOf = (v) => v * INNER_W;
  const yOf = (v) => INNER_H - v * INNER_H;

  const maxCount = Math.max(...points.map((p) => p.count), 1);
  const radiusOf = (count) => 4 + (count / maxCount) * 10;

  return (
    <div>
      <div className={styles.chartArea}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={styles.svg}>
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {TICKS.map((t) => (
              <g key={t}>
                <line x1={0} x2={INNER_W} y1={yOf(t)} y2={yOf(t)} className={styles.gridline} />
                <line x1={xOf(t)} x2={xOf(t)} y1={0} y2={INNER_H} className={styles.gridline} />
                <text x={-8} y={yOf(t)} className={styles.axisLabel} textAnchor="end" dominantBaseline="middle">
                  {Math.round(t * 100)}%
                </text>
                <text x={xOf(t)} y={INNER_H + 16} className={styles.axisLabel} textAnchor="middle">
                  {Math.round(t * 100)}%
                </text>
              </g>
            ))}

            <line x1={0} x2={INNER_W} y1={yOf(0)} y2={yOf(1)} className={styles.diagonal} />

            {points.map((p) => (
              <g key={p.binIdx}>
                <circle
                  cx={xOf(p.meanPred)}
                  cy={yOf(p.obsRate)}
                  r={radiusOf(p.count)}
                  className={styles.dot}
                />
                <title>
                  Predicted: {(p.meanPred * 100).toFixed(1)}% | Observed: {(p.obsRate * 100).toFixed(1)}% | n={p.count}
                </title>
              </g>
            ))}

            <text x={INNER_W / 2} y={INNER_H + 32} className={styles.axisTitle} textAnchor="middle">
              Mean predicted probability
            </text>
            <text
              x={0}
              y={0}
              className={styles.axisTitle}
              textAnchor="middle"
              transform={`translate(${-36},${INNER_H / 2}) rotate(-90)`}
            >
              Observed frequency
            </text>
          </g>
        </svg>
      </div>

      <div className={styles.summary}>
        <div className={styles.eceStat}>
          <span className={styles.eceLabel}>ECE</span>
          <span className={styles.eceValue}>{(ece * 100).toFixed(1)}pp</span>
        </div>
        <span className="muted" style={{ fontSize: "12px" }}>
          Expected calibration error — lower means the stated probabilities are more trustworthy.
          Based on {totalCount} outcome predictions from {matchDetails.length} matches.
        </span>
      </div>

      {matchDetails.length < 10 && (
        <p className="warn-banner" style={{ marginTop: "8px", fontSize: "13px" }}>
          Only {matchDetails.length} match{matchDetails.length === 1 ? "" : "es"} so
          far — bins are sparse and the diagram will become more meaningful as results accumulate.
        </p>
      )}

      <p className={`muted ${styles.caption}`}>
        Points on the diagonal mean the model's stated percentages match reality — if it says 40%,
        it happens ~40% of the time. Points below the line mean the model is overconfident (claims
        more than happens); above means underconfident.
      </p>
    </div>
  );
}
