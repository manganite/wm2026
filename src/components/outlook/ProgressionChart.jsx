import { useMemo, useState } from "react";
import { TeamLabel } from "../common/TeamLabel.jsx";
import { SEGMENTS, segmentsFor } from "../../lib/stageSegments.js";
import styles from "./ProgressionChart.module.css";

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
