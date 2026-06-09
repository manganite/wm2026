import { useMemo, useState } from "react";
import { TeamLabel } from "../common/TeamLabel.jsx";
import styles from "./ProgressionChart.module.css";

// Each segment = "probability this team's run ends at exactly this stage"
// (i.e. the drop-off between consecutive cumulative reach-probabilities).
// Stacking them turns the engine's cumulative `probs[code]` tally into a
// single distribution-over-final-stage bar per team — "how far are they
// likely to go", at a glance.
const SEGMENTS = [
  { key: "out", label: "Out in groups", color: "#cfcfd6", from: null, to: "R32" },
  { key: "R32", label: "Lost in R32", color: "#9aa7c7", from: "R32", to: "R16" },
  { key: "R16", label: "Lost in R16", color: "#7e93c9", from: "R16", to: "QF" },
  { key: "QF", label: "Lost in QF", color: "#6f7fd1", from: "QF", to: "SF" },
  { key: "SF", label: "Lost in SF", color: "#5f6bd6", from: "SF", to: "F" },
  { key: "F", label: "Runner-up", color: "#4f56d6", from: "F", to: "W" },
  { key: "W", label: "Champion", color: "#caa400", from: "W", to: null },
];

function segmentsFor(p) {
  return SEGMENTS.map((s) => {
    const upper = s.from ? p[s.from] : 1;
    const lower = s.to ? p[s.to] : 0;
    return { ...s, value: Math.max(0, upper - lower) };
  });
}

const DEFAULT_VISIBLE = 12;

// `topN` teams ranked by title-win probability, with an expand/collapse toggle.
export function ProgressionChart({ teams, probs, topN = DEFAULT_VISIBLE }) {
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(
    () => teams.slice().sort((a, b) => probs[b.code].W - probs[a.code].W),
    [teams, probs]
  );
  const ranked = expanded ? sorted : sorted.slice(0, topN);

  return (
    <div>
      <div className={styles.chart}>
        {ranked.map((team) => (
          <div className={styles.row} key={team.code}>
            <div className={styles.name}>
              <TeamLabel code={team.code} teamsByCode={{ [team.code]: team }} />
            </div>
            <div className={styles.bar}>
              {segmentsFor(probs[team.code]).map((seg) =>
                seg.value > 0.0005 ? (
                  <div
                    key={seg.key}
                    className={styles.seg}
                    style={{ width: `${seg.value * 100}%`, background: seg.color }}
                    title={`${seg.label}: ${(seg.value * 100).toFixed(1)}%`}
                  />
                ) : null
              )}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.footer}>
        <div className={styles.legend}>
          {SEGMENTS.map((s) => (
            <span className={styles.legendItem} key={s.key}>
              <span className={styles.swatch} style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
        {sorted.length > topN && (
          <button className={styles.expandBtn} onClick={() => setExpanded((e) => !e)}>
            {expanded ? `Show top ${topN}` : `Show all ${sorted.length} teams`}
          </button>
        )}
      </div>
    </div>
  );
}
