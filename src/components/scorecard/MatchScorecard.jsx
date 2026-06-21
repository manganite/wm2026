import { useMemo, useState } from "react";
import { TeamLabel } from "../common/TeamLabel.jsx";
import styles from "./MatchScorecard.module.css";

const SORT_OPTIONS = [
  { key: "recent", label: "Most recent" },
  { key: "surprise", label: "Biggest surprises" },
];

const DEFAULT_VISIBLE = 10;

const OUTCOME_LABEL = { homeWin: "Home", draw: "Draw", awayWin: "Away" };

function fmtPct(v) {
  return `${(v * 100).toFixed(0)}%`;
}

function fmtBits(v) {
  return v.toFixed(2);
}

export function MatchScorecard({ matchDetails, teams }) {
  const [sort, setSort] = useState("recent");
  const [expanded, setExpanded] = useState(false);
  const teamsByCode = useMemo(() => Object.fromEntries(teams.map((t) => [t.code, t])), [teams]);

  const sorted = useMemo(() => {
    const rows = [...matchDetails];
    if (sort === "surprise") {
      rows.sort((a, b) => b.surprisalBits - a.surprisalBits);
    } else {
      rows.sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id.localeCompare(a.id));
    }
    return rows;
  }, [matchDetails, sort]);

  if (matchDetails.length === 0) {
    return <p className="muted">No matches played yet — this fills in as results are entered.</p>;
  }

  const visible = expanded ? sorted : sorted.slice(0, DEFAULT_VISIBLE);

  return (
    <div>
      <div className={styles.controls}>
        <span className={`muted ${styles.sortLabel}`}>Sort by:</span>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            className={`${styles.sortBtn} ${sort === opt.key ? styles.sortBtnActive : ""}`}
            onClick={() => setSort(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Match scorecard table">
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thMatch}>Match</th>
              <th className={styles.thTendency}>Model tendency</th>
              <th className={styles.thPredScore}>Predicted score</th>
              <th className={styles.thResult}>Result</th>
              <th className={styles.thPActual}>p(result)</th>
              <th className={styles.thSurprisal}>Surprise</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const isSurprise = row.pOutcome < 0.15;
              return (
                <tr key={row.id} className={isSurprise ? styles.surpriseRow : ""}>
                  <td className={styles.matchCell}>
                    <TeamLabel code={row.home} teamsByCode={teamsByCode} />
                    {" vs "}
                    <TeamLabel code={row.away} teamsByCode={teamsByCode} />
                  </td>
                  <td className={styles.tendencyCell}>
                    <span className={styles.tendencyH}>Home {fmtPct(row.tendency.homeWin)}</span>
                    <span className={styles.tendencyD}>Draw {fmtPct(row.tendency.draw)}</span>
                    <span className={styles.tendencyA}>Away {fmtPct(row.tendency.awayWin)}</span>
                  </td>
                  <td className={styles.predScoreCell}>
                    {row.mostLikelyScore.score[0]}:{row.mostLikelyScore.score[1]}{" "}
                    <span className="muted">({fmtPct(row.mostLikelyScore.prob)})</span>
                  </td>
                  <td className={styles.resultCell}>
                    <span className={styles.score}>
                      {row.actualScore[0]}:{row.actualScore[1]}
                    </span>{" "}
                    <span className={styles.outcomeBadge} data-outcome={row.actualOutcome}>
                      {OUTCOME_LABEL[row.actualOutcome]}
                    </span>
                  </td>
                  <td className={styles.pActualCell}>
                    {(row.pResult * 100).toFixed(1)}%
                  </td>
                  <td className={styles.surprisalCell}>
                    <span className={isSurprise ? styles.highSurprisal : ""}>
                      {fmtBits(row.surprisalBits)} bits
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sorted.length > DEFAULT_VISIBLE && (
        <button className={styles.expandBtn} onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Show fewer" : `Show all ${sorted.length} matches`}
        </button>
      )}

      <p className={`muted ${styles.note}`}>
        Surprise measures how unexpected the result was for the model (in bits: 0 = certain and
        right, 1 = coin-flip, higher = bigger shock). This is <em>not</em> the same as impact on
        the title race — see Match Impact for that.
      </p>
    </div>
  );
}
