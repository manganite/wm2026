import { useMemo } from "react";
import { TeamLabel } from "../common/TeamLabel.jsx";
import { computeAllGroupStandings } from "../../lib/standings.js";
import styles from "./GroupStandingsTables.module.css";

const fmtGD = (gd) => (gd > 0 ? `+${gd}` : String(gd));

export function GroupStandingsTables({ data, simResults, baselineCtx, knockoutResolution, teams }) {
  const teamsByCode = useMemo(
    () => Object.fromEntries(teams.map((t) => [t.code, t])),
    [teams]
  );
  // Build the set of team codes that the bracket resolution placed in a slot —
  // used to distinguish "confirmed best third" from "eliminated third".
  const qualifiedCodes = useMemo(() => {
    if (!knockoutResolution) return new Set();
    const codes = new Set();
    for (const [, slot] of knockoutResolution) {
      if (slot.home) codes.add(slot.home);
      if (slot.away) codes.add(slot.away);
    }
    return codes;
  }, [knockoutResolution]);

  const standings = useMemo(
    () => computeAllGroupStandings(data, simResults, baselineCtx),
    [data, simResults, baselineCtx]
  );

  return (
    <div className={styles.grid}>
      {Object.keys(standings)
        .sort()
        .map((g) => (
          <div key={g} className={styles.group}>
            <div className={styles.groupTitle}>Group {g}</div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.rankCol}>#</th>
                  <th className={styles.teamCol}>Team</th>
                  <th>W</th>
                  <th>D</th>
                  <th>L</th>
                  <th>GD</th>
                  <th className={styles.ptsCol}>Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings[g].map((row) => {
                  const isTop2 = row.rank <= 2;
                  const isBestThird = row.rank === 3 && qualifiedCodes.has(row.code);
                  const rowClass = isTop2
                    ? styles.qualified
                    : isBestThird
                    ? styles.bestThird
                    : "";
                  return (
                    <tr key={row.code} className={rowClass}>
                      <td className={styles.rankCol}>{row.rank}</td>
                      <td className={styles.teamCol}>
                        <TeamLabel code={row.code} teamsByCode={teamsByCode} />
                      </td>
                      <td>{row.w}</td>
                      <td>{row.d}</td>
                      <td>{row.l}</td>
                      <td>{fmtGD(row.gd)}</td>
                      <td className={styles.ptsCol}>{row.pts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
