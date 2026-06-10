// Module worker — runs the verified Monte-Carlo engine off the main thread so
// the UI stays responsive. Imports engine.mjs unmodified; does not reimplement
// any simulation logic.
import { runMonteCarlo } from "../../engine.mjs";
import { resultsUpTo, T0 } from "../lib/timeline.js";

const EMPTY_RESULTS = { matches: {} };

self.onmessage = async (event) => {
  const { type, requestId, payload } = event.data;

  if (type === "RUN") {
    try {
      const { data, results, N, seed } = payload;
      const outcome = runMonteCarlo(data, results, N, seed);
      self.postMessage({ type: "DONE", requestId, payload: outcome });
    } catch (err) {
      self.postMessage({ type: "ERROR", requestId, payload: { message: err.message } });
    }
    return;
  }

  if (type === "RUN_TIMELINE") {
    try {
      const { data, results, points, N, seed } = payload;
      for (const date of points) {
        const pointResults = date === T0 ? EMPTY_RESULTS : resultsUpTo(results, data.fixtures, date);
        const { probs } = runMonteCarlo(data, pointResults, N, seed);
        self.postMessage({ type: "TIMELINE_POINT", requestId, payload: { date, probs } });
        // Yield so a superseding RUN_TIMELINE/terminate (e.g. after a
        // results.json poll) can be handled between points.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      self.postMessage({ type: "TIMELINE_DONE", requestId });
    } catch (err) {
      self.postMessage({ type: "ERROR", requestId, payload: { message: err.message } });
    }
    return;
  }
};
