import { useMemo, useState } from "react";
import { buildContext, predictKnownMatches, PARAMS } from "../engine.mjs";
import { DEFAULT_RUNS, DEFAULT_SEED, GITHUB_OWNER, GITHUB_REPO } from "./config.js";
import { useTournamentData } from "./hooks/useTournamentData.js";
import { useSimulation } from "./hooks/useSimulation.js";
import { useTimeline } from "./hooks/useTimeline.js";
import { buildKnockoutResolution, deriveTournamentProgress, deriveTeamStatus } from "./lib/bracket.js";
import {
  synthesizeGroupStageResults,
  synthesizeFullTournamentResults,
  PROJECTION_TIE_BREAK_SEED,
} from "./lib/selectors.js";
import { computeAccuracy, computeMatchDetails } from "./lib/accuracy.js";

import { LoadingState, ErrorBanner, WarnBanner } from "./components/common/LoadingState.jsx";
import { BackToTop } from "./components/common/BackToTop.jsx";
import { GroupStandingsTables } from "./components/groups/GroupStandingsTables.jsx";
import { TitleProbabilityTable } from "./components/outlook/TitleProbabilityTable.jsx";
import { ProgressionChart } from "./components/outlook/ProgressionChart.jsx";
import { TimelineSection } from "./components/timeline/TimelineSection.jsx";
import { LatestResultsCard } from "./components/timeline/LatestResultsCard.jsx";
import { FixturesPanel } from "./components/fixtures/FixturesPanel.jsx";
import { KnockoutBracket } from "./components/bracket/KnockoutBracket.jsx";
import { NowMarker } from "./components/live/NowMarker.jsx";
import { AccuracyReadout } from "./components/live/AccuracyReadout.jsx";
import { StartPointSelector } from "./components/live/StartPointSelector.jsx";
import { MatchScorecard } from "./components/scorecard/MatchScorecard.jsx";
import { CalibrationChart } from "./components/scorecard/CalibrationChart.jsx";
import { AccuracyOverTimeChart } from "./components/scorecard/AccuracyOverTimeChart.jsx";
import { MatchPerformanceChart } from "./components/performance/MatchPerformanceChart.jsx";
import { ProgressionDeltaChart } from "./components/performance/ProgressionDeltaChart.jsx";
import { computeTeamPerformance, computeProgressionDelta } from "./lib/performance.js";
import { T0 } from "./lib/timeline.js";
import { SimulationControls } from "./components/controls/SimulationControls.jsx";
import { SectionNav } from "./components/common/SectionNav.jsx";

const EMPTY_RESULTS = { matches: {} };
const KNOCKOUT_STAGE_MAP = { afterR32: "R32", afterR16: "R16", afterQF: "QF", afterSF: "SF", fullProjection: "F" };

// Top-level assembly: loads data, runs the (worker-backed) simulation against
// the real results or one of several projected start points, and lays out the
// main UI sections. Deliberately thin — every non-trivial computation lives
// in lib/* or the engine itself; this just wires data through to components.
export default function App() {
  const { status, teams: teamsFile, fixtures, results, validationIssues, error } = useTournamentData();
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
  // through selected knockout stages — see lib/selectors.js).
  const simResults = useMemo(() => {
    if (!results) return null;
    if (startPoint === "pretournament") return results;
    if (!baseline) return results;
    if (startPoint === "afterGroups") return synthesizeGroupStageResults(results, baseline);
    if (!baselineCtx) return results;
    const stopAfterStage = KNOCKOUT_STAGE_MAP[startPoint] ?? "F";
    return synthesizeFullTournamentResults(data, results, baseline, baselineCtx, PARAMS, { stopAfterStage });
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
            startPoint !== "pretournament" ? { tieBreakSeed: PROJECTION_TIE_BREAK_SEED } : undefined
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
  const matchDetails = useMemo(
    () => (data && results && actualResolution ? computeMatchDetails(data, results, actualResolution) : []),
    [data, results, actualResolution]
  );

  const teamPerformance = useMemo(
    () => (matchDetails.length > 0 && teams ? computeTeamPerformance(matchDetails, teams) : []),
    [matchDetails, teams]
  );
  const teamStatus = useMemo(
    () => (data && results && actualResolution ? deriveTeamStatus(data, results, actualResolution) : null),
    [data, results, actualResolution]
  );

  // Lifted here (rather than inside TimelineSection) so LatestResultsCard near
  // the top of the page can share the same computation/cache.
  const timeline = useTimeline({ data, results });

  const t0Probs = useMemo(
    () => timeline.points.find((p) => p.date === T0)?.probs ?? null,
    [timeline.points]
  );
  const progressionData = useMemo(
    () => (teams && t0Probs && teamStatus ? computeProgressionDelta(teams, t0Probs, teamStatus) : []),
    [teams, t0Probs, teamStatus]
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
      <a href="#outlook" className="visually-hidden skip-link">Skip to content</a>
      <header className="section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
          <h1 style={{ margin: 0 }}>WC 2026 — Monte-Carlo Outlook</h1>
          <a
            href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`}
            target="_blank"
            rel="noopener noreferrer"
            className="muted"
            style={{ fontSize: "13px", whiteSpace: "nowrap", alignSelf: "center" }}
          >
            github.com/{GITHUB_OWNER}/{GITHUB_REPO}
          </a>
        </div>
        <p className="muted">
          A Monte-Carlo simulation of the 2026 World Cup, run live in your browser and
          re-conditioned on the actual results as they come in — not a fixed, one-off forecast.
        </p>
      </header>

      {data && results && (
        <LatestResultsCard
          points={timeline.points}
          teams={teams}
          fixtures={fixtures}
          results={results}
          resolution={actualResolution}
        />
      )}

      <div className="section">
        <div className="card" style={{ display: "flex", gap: "20px", flexWrap: "wrap", alignItems: "flex-start" }}>
          <StartPointSelector value={startPoint} onChange={setStartPoint} />
          <SimulationControls runs={runs} onRunsChange={setRuns} status={sim.status} />
        </div>
        {startPoint !== "pretournament" && (
          <p className="muted" style={{ marginTop: "10px" }}>
            Projections fill undecided matches with the model's most-likely outcome — purely
            illustrative. Most-likely picks chained round by round compound into a
            low-probability path, not a forecast of what will actually happen.
          </p>
        )}
        {simRunning && <LoadingState label={`Running ${runs.toLocaleString()} simulated tournaments…`} />}
        {sim.status === "error" && <ErrorBanner message={`Simulation failed: ${sim.error}`} />}
        {validationIssues?.errors.map((msg, i) => (
          <ErrorBanner key={i} message={`results.json error: ${msg}`} />
        ))}
        {validationIssues?.warnings.map((msg, i) => (
          <WarnBanner key={i} message={`results.json warning: ${msg}`} />
        ))}
      </div>

      {sim.status === "done" && (
        <>
          <SectionNav />

          <section className="section" id="outlook">
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

          <section className="section" id="progression">
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

          <section className="section" id="timeline">
            <h2>Timeline</h2>
            <p className="muted">
              How the model's outlook has evolved as real results have come in — every point is
              the model re-run from scratch, conditioned only on results entered by that date.
            </p>
            {data && results && (
              <TimelineSection
                points={timeline.points}
                status={timeline.status}
                progress={timeline.progress}
                resolution={actualResolution}
                data={data}
                results={results}
                teams={teams}
              />
            )}
          </section>

          <section className="section" id="fixtures">
            <h2>Fixtures</h2>
            <details className="muted">
              <summary>Predictions for each unplayed match, with scoreline breakdowns by outcome.</summary>
              <p style={{ marginTop: "6px" }}>
                Tendency shows win/draw/win probabilities. The likeliest score is <em>conditional
                on</em> each outcome — "home win → 2:1 (19%)" means 2:1 is the likeliest
                scoreline <em>given</em> a home win, not how likely that win itself is. The single
                most-likely overall scoreline is often the draw even for a clear favourite, since
                the long tail of winning scorelines outweighs any one draw cell; advancement and
                title odds come from the full distribution over all simulated runs.
              </p>
            </details>
            <FixturesPanel
              teams={teams}
              fixtures={fixtures}
              results={simResults}
              predictions={sim.predictions}
              knockoutResolution={knockoutResolution}
              eloOf={eloOf}
            />
          </section>

          <section className="section" id="bracket">
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

          <section className="section" id="performance">
            <h2>Performance vs. expectation</h2>
            <p className="muted">
              How each team has performed relative to the model's pre-match expectations — based
              on Elo-implied expected goals (not shot-based xG). Small samples are noisy; treat
              these as descriptive, not predictive.
            </p>

            {matchDetails.length === 0 ? (
              <p className="muted">
                No matches have been played yet — this section fills in as results are entered.
              </p>
            ) : (
              <>
                <div className="card">
                  <h3>Match performance</h3>
                  <p className="muted">
                    Per-match over/under-performance vs. model expectation. Goal difference covers
                    all matches; points are group-stage only (knockout over-performance shows up in
                    Progression below). "Expected" means relative to the model's Elo ratings — a
                    persistent over-performer may simply be underrated.
                  </p>
                  <MatchPerformanceChart teamPerformance={teamPerformance} teams={teams} />
                </div>

                {progressionData.length > 0 && (
                  <div className="card" style={{ marginTop: "16px" }}>
                    <h3>Progression vs. expected</h3>
                    <p className="muted">
                      How far each team has actually gone vs. how far the pre-tournament model
                      expected — positive means further than expected. Only eliminated teams have
                      a final delta; teams still alive are provisional (faded bars).
                    </p>
                    <ProgressionDeltaChart progressionData={progressionData} teams={teams} />
                  </div>
                )}
              </>
            )}
          </section>

          <section className="section" id="report-card">
            <h2>Model report card</h2>
            <p className="muted">
              How well the model's pre-match predictions have matched the real results entered
              into <span className="mono">data/results.json</span> so far — a running track record
              of the model's accuracy, calibration, and biggest misses.
            </p>

            {!accuracy ? (
              <p className="muted">
                No matches have been played yet — this section fills in as results are entered.
              </p>
            ) : (
              <>
                <div className="card">
                  <h3>Accuracy summary</h3>
                  <AccuracyReadout accuracy={accuracy} />
                </div>

                <div className="card" style={{ marginTop: "16px" }}>
                  <h3>Accuracy over time</h3>
                  <p className="muted">
                    How the model's running Brier score and log-loss have evolved as results come in.
                  </p>
                  <AccuracyOverTimeChart matchDetails={matchDetails} fixtures={fixtures} />
                </div>

                <div className="card" style={{ marginTop: "16px" }}>
                  <h3>Calibration</h3>
                  <p className="muted">
                    Does the model's stated probability match how often that outcome actually happens?
                  </p>
                  <CalibrationChart matchDetails={matchDetails} />
                </div>

                <div className="card" style={{ marginTop: "16px" }}>
                  <h3>Per-match scorecard</h3>
                  <MatchScorecard matchDetails={matchDetails} teams={teams} />
                </div>
              </>
            )}
          </section>
        </>
      )}
      <BackToTop />
    </main>
  );
}
