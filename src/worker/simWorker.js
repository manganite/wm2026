// Module worker — runs the verified Monte-Carlo engine off the main thread so
// the UI stays responsive. Imports engine.mjs unmodified; does not reimplement
// any simulation logic.
import { runMonteCarlo } from "../../engine.mjs";

self.onmessage = (event) => {
  const { type, requestId, payload } = event.data;
  if (type !== "RUN") return;

  try {
    const { data, results, N, seed } = payload;
    const outcome = runMonteCarlo(data, results, N, seed);
    self.postMessage({ type: "DONE", requestId, payload: outcome });
  } catch (err) {
    self.postMessage({ type: "ERROR", requestId, payload: { message: err.message } });
  }
};
