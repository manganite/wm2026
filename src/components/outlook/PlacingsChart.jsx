import { useMemo, useState } from "react";
import { TeamLabel } from "../common/TeamLabel.jsx";
import { PLACINGS, placingsFor, topFourProb } from "../../lib/placings.js";
import { compareTeams } from "../../lib/ranking.js";
import styles from "./PlacingsChart.module.css";

const DEFAULT_VISIBLE = 12;
// Below this a bar is a sliver that can't be read and can't be labelled; the
// team is dropped rather than drawn as an empty row (~0.05%, the same
// threshold ProgressionChart uses to drop a segment).
const MIN_PROB = 0.0005;
// A segment narrower than this can't fit a "12%" label inside it with padding,
// so the label is dropped and the value stays available via the tooltip —
// never a clipped or overflowing number.
const MIN_LABEL_WIDTH = 0.09;

const fmtPct = (v) => `${(v * 100).toFixed(v >= 0.1 ? 0 : 1)}%`;

// Distribution over the four official final placings, one bar per team. Bar
// LENGTH is the team's chance of finishing in the top four at all (so the
// grey track behind it is "no top-four finish"); the split within the bar is
// which of the four positions. That keeps two questions readable at once —
// "can they medal?" and "if so, where?" — where normalising each bar to 100%
// would answer only the second and make a 2% outsider look like a favourite.
export function PlacingsChart({ teams, probs, topN = DEFAULT_VISIBLE }) {
  const [expanded, setExpanded] = useState(false);

  // Ranked by the chance of a top-four finish (i.e. P(reach SF), the bar's
  // full length), then — level on that — by how far they go: title first.
  const contenders = useMemo(
    () =>
      teams
        .filter((t) => topFourProb(probs[t.code]) > MIN_PROB)
        .sort((a, b) => compareTeams(a, b, probs, "SF", -1)),
    [teams, probs]
  );

  if (contenders.length === 0) {
    return <p className="muted">No team can reach the semi-finals yet — this fills in as the bracket resolves.</p>;
  }

  const ranked = expanded ? contenders : contenders.slice(0, topN);

  return (
    <div>
      <div className={styles.chart}>
        {ranked.map((team) => {
          const segments = placingsFor(probs[team.code]);
          return (
            <div className={styles.row} key={team.code}>
              <div className={styles.name}>
                <TeamLabel code={team.code} teamsByCode={{ [team.code]: team }} />
              </div>
              <div
                className={styles.bar}
                role="img"
                aria-label={`${team.name}: ${segments.map((s) => `${s.label} ${fmtPct(s.value)}`).join(", ")}`}
              >
                {segments.map((seg) =>
                  seg.value > MIN_PROB ? (
                    <div
                      key={seg.key}
                      className={styles.seg}
                      style={{ width: `${seg.value * 100}%`, background: seg.color }}
                      title={`${team.name} — finishes ${seg.label}: ${fmtPct(seg.value)}`}
                    >
                      {seg.value >= MIN_LABEL_WIDTH && (
                        <span className={styles.segLabel}>{fmtPct(seg.value)}</span>
                      )}
                    </div>
                  ) : null
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className={styles.footer}>
        <div className={styles.legend}>
          {PLACINGS.map((s) => (
            <span className={styles.legendItem} key={s.key}>
              <span className={styles.swatch} style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
          <span className={styles.legendItem}>
            <span className={`${styles.swatch} ${styles.swatchTrack}`} />
            No top-four finish
          </span>
        </div>
        {contenders.length > topN && (
          <button className={styles.expandBtn} onClick={() => setExpanded((e) => !e)}>
            {expanded ? `Show top ${topN}` : `Show all ${contenders.length} contenders`}
          </button>
        )}
      </div>
    </div>
  );
}
