import { useMemo, useState } from "react";
import { predictMatch, resolveWinnerToken, PARAMS } from "../../../engine.mjs";
import { describeRef } from "../../lib/bracket.js";
import { FixtureGroup } from "./FixtureGroup.jsx";
import styles from "./FixturesPanel.module.css";

const KO_STAGE_TITLES = { R32: "Round of 32", R16: "Round of 16", QF: "Quarter-finals", SF: "Semi-finals", F: "Final" };

function groupRow(prediction, teamsByCode) {
  return {
    id: prediction.id,
    home: { code: prediction.home, label: teamsByCode[prediction.home]?.name ?? prediction.home },
    away: { code: prediction.away, label: teamsByCode[prediction.away]?.name ?? prediction.away },
    played: prediction.played,
    score: prediction.played ? prediction.score : null,
    shootoutWinner: null, // group matches are never decided on penalties
    prediction: prediction.played ? null : prediction.prediction,
  };
}

function knockoutRow(fixture, results, resolution, eloOf, teamsByCode) {
  const slot = resolution.get(fixture.id);
  const homeCode = slot?.home ?? null;
  const awayCode = slot?.away ?? null;
  const played = results.matches[fixture.id];

  const labelFor = (code, ref) => (code ? teamsByCode[code]?.name ?? code : describeRef(ref));

  let prediction = null;
  if (!played && slot?.bothKnown) {
    prediction = predictMatch(eloOf[homeCode], eloOf[awayCode], PARAMS);
  }

  let shootoutWinner = null;
  if (played?.[2] != null && homeCode && awayCode) {
    shootoutWinner = resolveWinnerToken(played[2], homeCode, awayCode);
  }

  return {
    id: fixture.id,
    home: { code: homeCode, label: labelFor(homeCode, fixture.home) },
    away: { code: awayCode, label: labelFor(awayCode, fixture.away) },
    played: !!played,
    score: played ? [played[0], played[1]] : null,
    shootoutWinner,
    prediction,
  };
}

// Lists every fixture grouped by stage/group: played matches show the actual
// score and a "fixed" badge; unplayed ones show the shared MatchPrediction
// once their participants are concretely known.
export function FixturesPanel({ teams, fixtures, results, predictions, knockoutResolution, eloOf }) {
  const [tab, setTab] = useState("group");

  const teamsByCode = useMemo(() => Object.fromEntries(teams.map((t) => [t.code, t])), [teams]);
  const predictionById = useMemo(() => Object.fromEntries(predictions.map((p) => [p.id, p])), [predictions]);

  const groupSections = useMemo(() => {
    const byGroup = {};
    for (const m of fixtures.groupStage) {
      (byGroup[m.group] ??= []).push(groupRow(predictionById[m.id], teamsByCode));
    }
    return Object.keys(byGroup)
      .sort()
      .map((g) => ({ title: `Group ${g}`, rows: byGroup[g] }));
  }, [fixtures, predictionById, teamsByCode]);

  const knockoutSections = useMemo(() => {
    const byStage = {};
    for (const m of fixtures.knockout) {
      (byStage[m.stage] ??= []).push(knockoutRow(m, results, knockoutResolution, eloOf, teamsByCode));
    }
    return ["R32", "R16", "QF", "SF", "F"]
      .filter((s) => byStage[s])
      .map((s) => ({ title: KO_STAGE_TITLES[s], rows: byStage[s] }));
  }, [fixtures, results, knockoutResolution, eloOf, teamsByCode]);

  const sections = tab === "group" ? groupSections : knockoutSections;

  return (
    <div>
      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === "group" ? styles.active : ""}`} onClick={() => setTab("group")}>
          Group stage
        </button>
        <button className={`${styles.tab} ${tab === "knockout" ? styles.active : ""}`} onClick={() => setTab("knockout")}>
          Knockout stage
        </button>
      </div>

      <div className={tab === "group" ? styles.groupGrid : ""}>
        {sections.map((s) => (
          <FixtureGroup key={s.title} title={s.title} rows={s.rows} teamsByCode={teamsByCode} />
        ))}
      </div>
    </div>
  );
}
