import { useEffect, useRef, useState } from "react";

// Runs the Monte-Carlo engine in a module worker and exposes its status.
// Re-runs (debounced) whenever data/results/N/seed change; discards any
// in-flight response that's no longer the latest request (e.g. the user
// dragged the N slider past several values quickly).
export function useSimulation({ data, results, N, seed }) {
  const [state, setState] = useState({ status: "idle", probs: null, predictions: null, error: null });
  const workerRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const worker = new Worker(new URL("../worker/simWorker.js", import.meta.url), { type: "module" });
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const { type, requestId, payload } = event.data;
      if (requestId !== requestIdRef.current) return; // stale response — ignore

      if (type === "DONE") {
        setState({ status: "done", probs: payload.probs, predictions: payload.predictions, error: null });
      } else if (type === "ERROR") {
        setState({ status: "error", probs: null, predictions: null, error: payload.message });
      }
    };

    return () => worker.terminate();
  }, []);

  useEffect(() => {
    if (!data || !results) return;
    const worker = workerRef.current;
    if (!worker) return;

    const requestId = ++requestIdRef.current;
    setState((prev) => ({ ...prev, status: "running" }));

    const timer = setTimeout(() => {
      worker.postMessage({ type: "RUN", requestId, payload: { data, results, N, seed } });
    }, 250); // debounce rapid changes (e.g. dragging the N control)

    return () => clearTimeout(timer);
  }, [data, results, N, seed]);

  return state;
}
