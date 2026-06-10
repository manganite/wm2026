import { useMemo } from "react";
import { TeamLabel } from "../common/TeamLabel.jsx";
import { resolveMatchTeams, formatPointDate, computeImpactEntries } from "./chartUtils.js";
import styles from "./LatestResultsCard.module.css";

// A small "what just happened" summary near the top of the page: the most
// recent match day's results and the title-probability movers they produced
// (the latest entry of MatchImpactPanel/V2), with a link down to the full
// Timeline. Renders nothing pre-tournament, before any result has been
// entered (points.length === 1, only the t0 baseline).
export function LatestResultsCard({ points, teams, fixtures, results, resolution }) {
  const teamsByCode = useMemo(() => Object.fromEntries(teams.map((t) => [t.code, t])), [teams]);
  const entries = useMemo(
    () => computeImpactEntries(points, teams, fixtures, results),
    [points, teams, fixtures, results]
  );

  if (entries.length === 0) return null;
  const entry = entries[entries.length - 1];

  return (
    <section className="section">
      <div className="card">
        <div className={styles.header}>
          <h3>Latest results — {formatPointDate(entry.date)}</h3>
          <a
            href="#timeline"
            className={styles.link}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById("timeline")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Full timeline ↓
          </a>
        </div>
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
      </div>
    </section>
  );
}
