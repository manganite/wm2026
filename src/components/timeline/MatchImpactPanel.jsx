import { useMemo, useState } from "react";
import { matchesOnDate } from "../../lib/timeline.js";
import { TeamLabel } from "../common/TeamLabel.jsx";
import { resolveMatchTeams, formatPointDate } from "./chartUtils.js";
import styles from "./MatchImpactPanel.module.css";

const DEFAULT_VISIBLE = 3;
const TOP_MOVERS = 5;

// V2: for each match day, the matches played and the title-probability movers
// they produced (the deltas behind V1's lines) — reverse-chronological, since
// the most recent match day is usually what a returning visitor cares about.
export function MatchImpactPanel({ points, teams, fixtures, results, resolution }) {
  const [expanded, setExpanded] = useState(false);
  const teamsByCode = useMemo(() => Object.fromEntries(teams.map((t) => [t.code, t])), [teams]);

  const entries = useMemo(() => {
    const out = [];
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const movers = teams
        .map((t) => ({ code: t.code, delta: curr.probs[t.code].W - prev.probs[t.code].W }))
        .filter((m) => Math.abs(m.delta) > 0.0005)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, TOP_MOVERS);
      out.push({ date: curr.date, matches: matchesOnDate(fixtures, results, curr.date), movers });
    }
    return out.reverse();
  }, [points, teams, fixtures, results]);

  if (entries.length === 0) {
    return <p className="muted">No results entered yet — this fills in as matches are played.</p>;
  }

  const visible = expanded ? entries : entries.slice(0, DEFAULT_VISIBLE);

  return (
    <div>
      <ul className={styles.list}>
        {visible.map((entry) => (
          <li key={entry.date} className={styles.entry}>
            <div className={styles.date}>{formatPointDate(entry.date)}</div>
            {entry.matches.length > 0 && (
              <ul className={styles.matches}>
                {entry.matches.map((m) => {
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
            {entry.movers.length > 0 && (
              <div className={styles.movers}>
                {entry.movers.map((m) => (
                  <span key={m.code} className={m.delta >= 0 ? styles.up : styles.down}>
                    <TeamLabel code={m.code} teamsByCode={teamsByCode} /> {m.delta >= 0 ? "+" : ""}
                    {(m.delta * 100).toFixed(1)}pp
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      {entries.length > DEFAULT_VISIBLE && (
        <button className={styles.expandBtn} onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Show fewer" : `Show all ${entries.length} match days`}
        </button>
      )}
    </div>
  );
}
