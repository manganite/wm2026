import { useMemo, useState } from "react";
import { buildContext, predictKnownMatches, PARAMS } from "../engine.mjs";
import { DEFAULT_RUNS, DEFAULT_SEED } from "./config.js";
import { useTournamentData } from "./hooks/useTournamentData.js";
import { useSimulation } from "./hooks/useSimulation.js";
import { buildKnockoutResolution, deriveTournamentProgress } from "./lib/bracket.js";
import { synthesizeGroupStageResults } from "./lib/selectors.js";
import { computeAccuracy } from "./lib/accuracy.js";

import { LoadingState, ErrorBanner } from "./components/common/LoadingState.jsx";
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

  // Pre-tournament baseline: analytic (Elo -> Poisson/DC via predictMatch),
  // exact and independent of N. Doubles as (a) the source of "most likely"
  // group scores for the projected start point, and (b) the fixed scoring
  // reference for the accuracy readout — see lib/selectors.js and lib/accuracy.js.
  const baseline = useMemo(() => {
    if (!data) return null;
    const ctx = buildContext(data, EMPTY_RESULTS, PARAMS);
    return predictKnownMatches(data, EMPTY_RESULTS, ctx, PARAMS);
  }, [data]);

  // The results object actually fed to the simulation: real results, or — for
  // the "after group stage (projected)" start point — real results with every
  // still-unplayed group match filled in by the model's modal scoreline.
  const simResults = useMemo(() => {
    if (!results) return null;
    if (startPoint === "groups" && baseline) return synthesizeGroupStageResults(results, baseline);
    return results;
  }, [results, startPoint, baseline]);

  const sim = useSimulation({ data, results: simResults, N: runs, seed: DEFAULT_SEED });

  const knockoutResolution = useMemo(
    () => (data && simResults ? buildKnockoutResolution(data, simResults) : null),
    [data, simResults]
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
        {progress && <NowMarker progress={progress} />}
      </header>

      <section className="section">
        <h2>Start point</h2>
        <p className="muted">
          Simulate forward from the real results entered so far, or — purely for illustration —
          from a projection where every undecided group match finishes with the model's current
          single most-likely score. Real tournaments are not decided by modal scorelines; the
          projection is clearly a hypothetical, not a forecast of what will actually happen.
        </p>
        <StartPointSelector value={startPoint} onChange={setStartPoint} />
      </section>

      <section className="section">
        <h2>Simulation</h2>
        <SimulationControls runs={runs} onRunsChange={setRuns} status={sim.status} />
        {simRunning && <LoadingState label={`Running ${runs.toLocaleString()} simulated tournaments…`} />}
        {sim.status === "error" && <ErrorBanner message={`Simulation failed: ${sim.error}`} />}
      </section>

      {sim.status === "done" && (
        <>
          <section className="section">
            <h2>Tournament outlook</h2>
            <p className="muted">All 48 teams, ranked by title probability — click a column to sort by it.</p>
            <div className="card">
              <TitleProbabilityTable teams={teams} probs={sim.probs} />
            </div>
          </section>

          <section className="section">
            <h2>Progression — how far will each team go?</h2>
            <p className="muted">
              The top 12 teams by title probability, broken down by the stage their run is most
              likely to end at.
            </p>
            <div className="card">
              <ProgressionChart teams={teams} probs={sim.probs} />
            </div>
          </section>

          <section className="section">
            <h2>Fixtures</h2>
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
            />
          </section>

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
        </>
      )}
    </main>
  );
}
