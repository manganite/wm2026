import { useMemo, useState } from "react";
import { TeamLabel } from "../common/TeamLabel.jsx";
import { ProbBar } from "../common/ProbBar.jsx";
import styles from "./TitleProbabilityTable.module.css";

const COLUMNS = [
  { key: "R32", label: "Reach R32" },
  { key: "R16", label: "Reach R16" },
  { key: "QF", label: "Reach QF" },
  { key: "SF", label: "Reach SF" },
  { key: "F", label: "Reach Final" },
  { key: "W", label: "Win title" },
];

// Sortable probability table for all 48 teams. Pure display of `probs`
// (the engine's stage-reach tallies) — no engine calls of its own.
export function TitleProbabilityTable({ teams, probs }) {
  const [sort, setSort] = useState({ key: "W", dir: -1 });

  const rows = useMemo(() => {
    const arr = teams.map((t) => ({ team: t, p: probs[t.code] }));
    arr.sort((a, b) => sort.dir * (a.p[sort.key] - b.p[sort.key]));
    return arr;
  }, [teams, probs, sort]);

  function toggleSort(key) {
    setSort((prev) => (prev.key === key ? { key, dir: -prev.dir } : { key, dir: -1 }));
  }

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th></th>
          <th>Team</th>
          <th>Group</th>
          {COLUMNS.map((c) => (
            <th
              key={c.key}
              className={sort.key === c.key ? styles.active : ""}
              onClick={() => toggleSort(c.key)}
              aria-sort={sort.key === c.key ? (sort.dir === -1 ? "descending" : "ascending") : "none"}
            >
              {c.label} {sort.key === c.key ? (sort.dir === -1 ? "▾" : "▴") : ""}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(({ team, p }, i) => (
          <tr key={team.code}>
            <td className={styles.rank}>{i + 1}</td>
            <td>
              <TeamLabel code={team.code} teamsByCode={{ [team.code]: team }} showCode />
            </td>
            <td className="muted">{team.group}</td>
            {COLUMNS.map((c) => (
              <td key={c.key} className={styles.numCell}>
                <ProbBar value={p[c.key]} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
