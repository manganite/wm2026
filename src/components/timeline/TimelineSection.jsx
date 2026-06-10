import { useMemo } from "react";
import { useTimeline } from "../../hooks/useTimeline.js";
import { buildKnockoutResolution } from "../../lib/bracket.js";
import { HISTORY_RUNS, DEFAULT_RUNS } from "../../config.js";
import { LoadingState } from "../common/LoadingState.jsx";
import { TitleProbabilityChart } from "./TitleProbabilityChart.jsx";
import { MatchImpactPanel } from "./MatchImpactPanel.jsx";
import { StageDistributionChart } from "./StageDistributionChart.jsx";
import { GroupQualificationCharts } from "./GroupQualificationCharts.jsx";

// Orchestrates the Timeline section: runs useTimeline (re-conditioning the
// engine on the real results up to each match day, cached), then lays out
// V1-V4. `results` is always the REAL results — the timeline shows how the
// actual tournament has unfolded, independent of the projected start point
// used elsewhere on the page.
export function TimelineSection({ data, results, teams }) {
  const { points, status, progress } = useTimeline({ data, results });
  const resolution = useMemo(() => buildKnockoutResolution(data, results), [data, results]);

  if (points.length === 0) {
    return <LoadingState label="Loading timeline…" />;
  }

  const last = points[points.length - 1];
  const empty = points.length === 1;
  const defaultCode = teams.slice().sort((a, b) => last.probs[b.code].W - last.probs[a.code].W)[0].code;

  return (
    <>
      {status === "running" && (
        <LoadingState label={`Computing timeline… (${progress.done}/${progress.total} dates)`} />
      )}

      {empty && (
        <p className="muted">
          No results have been entered yet, so the timeline has only its pre-tournament
          baseline. Each section below grows by one point per match day as real results come in.
        </p>
      )}

      <div className="card">
        <h3>Title probability over time</h3>
        <TitleProbabilityChart
          points={points}
          teams={teams}
          fixtures={data.fixtures}
          results={results}
          resolution={resolution}
        />
        <p className="muted" style={{ marginTop: "10px", fontSize: "12px" }}>
          Historical points are computed at {HISTORY_RUNS.toLocaleString()} simulated tournaments
          each (vs {DEFAULT_RUNS.toLocaleString()} for the "Tournament outlook" table above) —
          plenty of precision for a curve, though the latest point may differ by roughly a
          percentage point from that table.
        </p>
      </div>

      <div className="card">
        <h3>Match impact</h3>
        <p className="muted">
          The biggest title-probability movers from each match day's results.
        </p>
        <MatchImpactPanel
          points={points}
          teams={teams}
          fixtures={data.fixtures}
          results={results}
          resolution={resolution}
        />
      </div>

      <div className="card">
        <h3>Stage distribution over time</h3>
        <p className="muted">
          For the selected team, how its probability mass is split across "ends in groups / R32 /
          R16 / ... / Champion" — and how that shifts as results come in.
        </p>
        <StageDistributionChart points={points} teams={teams} fixtures={data.fixtures} defaultCode={defaultCode} />
      </div>

      <div className="card">
        <h3>Group qualification races</h3>
        <p className="muted">
          Each group's four teams' probability of reaching the Round of 32, through the end of
          the group stage. Best-third uncertainty can keep these moving even after a team's own
          group is finished.
        </p>
        <GroupQualificationCharts points={points} teams={teams} fixtures={data.fixtures} />
      </div>
    </>
  );
}
