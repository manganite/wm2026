import { useEffect, useRef, useState } from "react";
import { RESULTS_RAW_URL, RESULTS_POLL_INTERVAL_MS } from "../config.js";

const dataUrl = (name) => `${import.meta.env.BASE_URL}data/${name}`;

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

// Live results.json: prefer the raw GitHub URL (so a hand-edit + commit
// updates the deployed site without a rebuild), cache-busted so neither the
// browser nor any CDN serves a stale copy. Falls back to the bundled snapshot
// (e.g. before the repo exists, CORS failures, offline dev).
async function loadResults() {
  try {
    return await fetchJson(`${RESULTS_RAW_URL}?t=${Date.now()}`, { cache: "no-store" });
  } catch {
    return fetchJson(dataUrl("results.json"));
  }
}

// Loads teams/fixtures once (bundled, static for the whole tournament) and
// results.json on a poll (it changes as the tournament unfolds). Re-fetches
// are compared by content so byte-identical polls don't trigger re-simulation.
export function useTournamentData() {
  const [state, setState] = useState({ status: "loading", teams: null, fixtures: null, results: null, error: null });
  const lastResultsJson = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const [teams, fixtures, results] = await Promise.all([
          fetchJson(dataUrl("teams.json")),
          fetchJson(dataUrl("fixtures.json")),
          loadResults(),
        ]);
        if (cancelled) return;
        lastResultsJson.current = JSON.stringify(results);
        setState({ status: "ready", teams, fixtures, results, error: null });
      } catch (err) {
        if (!cancelled) setState((prev) => ({ ...prev, status: "error", error: err.message }));
      }
    }
    init();

    const poll = setInterval(async () => {
      try {
        const results = await loadResults();
        const json = JSON.stringify(results);
        if (json !== lastResultsJson.current) {
          lastResultsJson.current = json;
          setState((prev) => ({ ...prev, results }));
        }
      } catch {
        // transient fetch failure — keep showing the last known results
      }
    }, RESULTS_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, []);

  return state;
}
