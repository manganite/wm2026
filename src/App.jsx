import { useMemo, useState } from "react";
import { buildContext, predictKnownMatches, PARAMS } from "../engine.mjs";
import { DEFAULT_RUNS, DEFAULT_SEED } from "./config.js";
import { useTournamentData } from "./hooks/useTournamentData.js";
import { useSimulation } from "./hooks/useSimulation.js";
import { buildKnockoutResolution, deriveTournamentProgress } from "./lib/bracket.js";
import {
  synthesizeGroupStageResults,
  synthesizeFullTournamentResults,
  PROJECTION_TIE_BREAK_SEED,
} from "./lib/selectors.js";
import { computeAccuracy } from "./lib/accuracy.js";

import { LoadingState, ErrorBanner } from "./components/common/LoadingState.jsx";
import { GroupStandingsTables } from "./components/groups/GroupStandingsTables.jsx";
import { TitleProbabilityTable } from "./components/outlook/TitleProbabilityTable.jsx";
import { ProgressionChart } from "./components/outlook/ProgressionChart.jsx";
import { FixturesPanel } from "./components/fixtures/FixturesPanel.jsx";
import { KnockoutBracket } from "./components/bracket/KnockoutBracket.jsx";
import { NowMarker } from "./components/live/NowMarker.jsx";
import { AccuracyReadout } from "./components/live/AccuracyReadout.jsx";
import { StartPointSelector } from "./components/live/StartPointSelector.jsx";
import { SimulationControls } from "./components/controls/SimulationControls.jsx";

const EMPTY_RESULTS = { matches: {} };

// Top-level assembly: loads data, runs the (worker-backed) simulation against
// either the real entered results or a "what if the groups finished as
// expected" projection, and lays out the five UI sections from the brief.
// Deliberately thin — every non-trivial computation lives in lib/* or the
// engine itself; this just wires data through to display components.
export default function App() {
  const { status, teams: teamsFile, fixtures, results, error } = useTournamentData();
  const [runs, setRuns] = useState(DEFAULT_RUNS);
  const [startPoint, setStartPoint] = useState("pretournament");

  // teams.json wraps its team list as { teams: [...] } (engine.mjs reads
  // `data.teams.teams` directly) — unwrap once here so display components can
  // work with a plain array, while `data` keeps the raw shape the engine wants.
  const teams = teamsFile?.teams ?? null;
  const data = useMemo(() => (teamsFile && fixtures ? { teams: teamsFile, fixtures } : null), [teamsFile, fixtures]);

  // Pre-tournament context + baseline: analytic (Elo -> Poisson/DC via
  // predictMatch), exact and independent of N. Elo doesn't depend on results,
  // so this context's `eloOf` stays valid for projecting knockout matches too.
  // Together they're (a) the source of "most likely" scores for the projected
  // start points, and (b) the fixed scoring reference for the accuracy
  // readout — see lib/selectors.js and lib/accuracy.js.
  const baselineCtx = useMemo(() => (data ? buildContext(data, EMPTY_RESULTS, PARAMS) : null), [data]);
  const baseline = useMemo(
    () => (data && baselineCtx ? predictKnownMatches(data, EMPTY_RESULTS, baselineCtx, PARAMS) : null),
    [data, baselineCtx]
  );

  // The results object actually fed to the simulation: real results, or — for
  // the projected start points — real results with undecided matches filled
  // in by the model's most-likely outcome (group stage only, or propagated
  // all the way through the bracket — see lib/selectors.js).
  const simResults = useMemo(() => {
    if (!results) return null;
    if (startPoint === "groups" && baseline) return synthesizeGroupStageResults(results, baseline);
    if (startPoint === "fullProjection" && baseline && baselineCtx) {
      return synthesizeFullTournamentResults(data, results, baseline, baselineCtx, PARAMS);
    }
    return results;
  }, [results, startPoint, baseline, baselineCtx, data]);

  const sim = useSimulation({ data, results: simResults, N: runs, seed: DEFAULT_SEED });

  // Mirror the tie-break commitment synthesizeFullTournamentResults made
  // internally: that's the only way every synthesized knockout score ends up
  // attached to the same two teams the bracket displays for it. The real
  // (results-driven) views keep strict double-seed agreement — they must stay
  // honest about what the actual tournament has, and hasn't, decided yet.
  const knockoutResolution = useMemo(
    () =>
      data && simResults
        ? buildKnockoutResolution(
            data,
            simResults,
            startPoint === "fullProjection" ? { tieBreakSeed: PROJECTION_TIE_BREAK_SEED } : undefined
          )
        : null,
    [data, simResults, startPoint]
  );
  const eloOf = useMemo(
    () => (data && simResults ? buildContext(data, simResults, PARAMS).eloOf : null),
    [data, simResults]
  );

  // Progress and accuracy always describe the REAL tournament — "where things
  // stand" and "how the model has done so far" — never the projected start
  // point, which is purely hypothetical.
  const progress = useMemo(
    () => (fixtures && results ? deriveTournamentProgress(fixtures, results) : null),
    [fixtures, results]
  );
  const actualResolution = useMemo(
    () => (data && results ? buildKnockoutResolution(data, results) : null),
    [data, results]
  );
  const accuracy = useMemo(
    () => (data && results && actualResolution ? computeAccuracy(data, results, actualResolution) : null),
    [data, results, actualResolution]
  );

  if (status === "loading") {
    return (
      <main>
        <h1>WC 2026 — Monte-Carlo Outlook</h1>
        <LoadingState label="Loading tournament data…" />
      </main>
    );
  }

  if (status === "error") {
    return (
      <main>
        <h1>WC 2026 — Monte-Carlo Outlook</h1>
        <ErrorBanner message={`Couldn't load tournament data: ${error}`} />
      </main>
    );
  }

  const simRunning = sim.status === "idle" || sim.status === "running";

  return (
    <main>
      <header className="section">
        <h1>WC 2026 — Monte-Carlo Outlook</h1>
        <p className="muted">
          A Monte-Carlo simulation of the 2026 World Cup, run live in your browser and
          re-conditioned on the actual results as they come in — not a fixed, one-off forecast.
        </p>
      </header>

      <div className="section">
        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", alignItems: "flex-start" }}>
          <StartPointSelector value={startPoint} onChange={setStartPoint} />
          <SimulationControls runs={runs} onRunsChange={setRuns} status={sim.status} />
        </div>
        {startPoint !== "pretournament" && (
          <p className="muted" style={{ marginTop: "10px" }}>
            Projections fill undecided matches with the model's most-likely outcome — purely
            illustrative. Six rounds of "most likely" picks chain into one low-probability path,
            not a forecast of what will actually happen.
          </p>
        )}
        {simRunning && <LoadingState label={`Running ${runs.toLocaleString()} simulated tournaments…`} />}
        {sim.status === "error" && <ErrorBanner message={`Simulation failed: ${sim.error}`} />}
      </div>

      {sim.status === "done" && (
        <>
          <section className="section">
            <h2>Tournament outlook</h2>
            <p className="muted">All 48 teams, ranked by title probability — click a column to sort by it.</p>
            <div className="card">
              <TitleProbabilityTable teams={teams} probs={sim.probs} />
            </div>
          </section>

          {startPoint !== "pretournament" && (
            <section className="section">
              <h2>Group standings (projected)</h2>
              <p className="muted">
                Group results filled in with the model's most-likely outcome for each unplayed match.
                Green rows qualified directly (1st/2nd); blue rows qualified as best third-placed team.
              </p>
              <GroupStandingsTables
                data={data}
                simResults={simResults}
                baselineCtx={baselineCtx}
                knockoutResolution={knockoutResolution}
                teams={teams}
              />
            </section>
          )}

          <section className="section">
            <h2>Progression — how far will each team go?</h2>
            <p className="muted">
              The top 12 teams by title probability, broken down by the stage their run is most
              likely to end at. The "now" marker below shows where the real tournament currently
              stands — everything up to it is the actual entered results; everything beyond it,
              including these bars, is the model's projection.
            </p>
            {progress && <NowMarker progress={progress} />}
            <div className="card">
              <ProgressionChart teams={teams} probs={sim.probs} />
            </div>
          </section>

          <section className="section">
            <h2>Fixtures</h2>
            <p className="muted">
              Each unplayed match shows its prediction: Tendency (win/draw/win probabilities), the
              likeliest score <em>conditional on</em> each outcome — "home win → 2:1, 19% of those"
              means 2:1 is the likeliest scoreline <em>given</em> a home win, not how likely that
              win itself is (Tendency answers that) — the overall top-3 scorelines, and expected
              goals. The single most-likely overall scoreline is often the draw even for a clear
              favourite, since the long tail of winning scorelines (2-0, 2-1, 3-1, …) outweighs
              any one draw cell; advancement and title odds come from the full distribution over
              all simulated runs, not any single match's prediction.
            </p>
            <FixturesPanel
              teams={teams}
              fixtures={fixtures}
              results={simResults}
              predictions={sim.predictions}
              knockoutResolution={knockoutResolution}
              eloOf={eloOf}
            />
          </section>

          <section className="section">
            <h2>Knockout bracket</h2>
            <KnockoutBracket
              teams={teams}
              fixtures={fixtures}
              results={simResults}
              knockoutResolution={knockoutResolution}
              eloOf={eloOf}
              slotAdvancement={sim.slotAdvancement}
            />
          </section>

          {accuracy && (
            <section className="section">
              <h2>Model accuracy so far</h2>
              <p className="muted">
                A running track record: how well the model's pre-match predictions have matched the
                real results entered into <span className="mono">data/results.json</span> so far.
              </p>
              <div className="card">
                <AccuracyReadout accuracy={accuracy} />
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
