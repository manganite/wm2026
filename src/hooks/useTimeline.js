import { useEffect, useMemo, useRef, useState } from "react";
import { ENGINE_VERSION } from "../../engine.mjs";
import { HISTORY_RUNS, DEFAULT_SEED } from "../config.js";
import { T0, timelinePoints, resultsUpTo, compareTimelineDates } from "../lib/timeline.js";
import { timelineCacheKey } from "../lib/hash.js";

const EMPTY_RESULTS = { matches: {} };
const REQUEST_ID = 1; // single dedicated worker, recreated on each recompute — no staleness to track

// In-memory fallback for when localStorage throws (quota, Safari private mode,
// unavailable in some embeds) — keeps caching working for the session.
const memoryCache = new Map();

function readCache(key) {
  if (memoryCache.has(key)) return memoryCache.get(key);
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(key, probs) {
  memoryCache.set(key, probs);
  try {
    localStorage.setItem(key, JSON.stringify(probs));
  } catch {
    // quota exceeded / unavailable — memoryCache above still serves this session
  }
}

function sortPoints(points) {
  return points.slice().sort((a, b) => compareTimelineDates(a.date, b.date));
}

const INITIAL_STREAM = { key: "", points: [], workerStatus: "running", error: null };

// Computes the probability-over-time timeline: one point per date with an
// entered result, plus the t0 pre-tournament anchor (see lib/timeline.js).
// Each point is `runMonteCarlo` re-conditioned on results up to that date, at
// HISTORY_RUNS (lower than the "current state" DEFAULT_RUNS, since a curve of
// many points needs less precision per point than a single headline number).
//
// Historical points are immutable once their date's results are complete, so
// they're cached in localStorage keyed by (subset, HISTORY_RUNS, seed,
// ENGINE_VERSION) — only new/changed dates are recomputed, in a dedicated
// worker so this never blocks the main simulation.
export function useTimeline({ data, results }) {
  const [stream, setStream] = useState(INITIAL_STREAM);
  const workerRef = useRef(null);

  // Splits the timeline's dates into points already cached and points that
  // need (re)computing. Pure/derivable from props, so this lives in render,
  // not an effect — the effect below only manages the worker lifecycle.
  const { cachedPoints, uncached, key } = useMemo(() => {
    if (!data || !results) return { cachedPoints: [], uncached: [], key: "" };
    const fixtures = data.fixtures;
    const cachedPoints = [];
    const uncached = [];
    for (const date of timelinePoints(results, fixtures)) {
      const pointResults = date === T0 ? EMPTY_RESULTS : resultsUpTo(results, fixtures, date);
      const cacheKey = timelineCacheKey(pointResults, HISTORY_RUNS, DEFAULT_SEED, ENGINE_VERSION);
      const cached = readCache(cacheKey);
      if (cached) cachedPoints.push({ date, probs: cached });
      else uncached.push({ date, cacheKey });
    }
    return { cachedPoints, uncached, key: uncached.map((u) => u.cacheKey).join(",") };
  }, [data, results]);

  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (uncached.length === 0) return;

    const worker = new Worker(new URL("../worker/simWorker.js", import.meta.url), { type: "module" });
    workerRef.current = worker;

    const keyByDate = new Map(uncached.map(({ date, cacheKey }) => [date, cacheKey]));

    worker.onmessage = (event) => {
      const { type, requestId, payload } = event.data;
      if (requestId !== REQUEST_ID) return;

      if (type === "TIMELINE_POINT") {
        writeCache(keyByDate.get(payload.date), payload.probs);
        setStream((prev) => ({
          key,
          error: null,
          workerStatus: "running",
          points: [...(prev.key === key ? prev.points : []), { date: payload.date, probs: payload.probs }],
        }));
      } else if (type === "TIMELINE_DONE") {
        setStream((prev) => ({ ...prev, key, workerStatus: "done" }));
      } else if (type === "ERROR") {
        setStream((prev) => ({ ...prev, key, workerStatus: "error", error: payload.message }));
      }
    };

    worker.postMessage({
      type: "RUN_TIMELINE",
      requestId: REQUEST_ID,
      payload: { data, results, points: uncached.map((u) => u.date), N: HISTORY_RUNS, seed: DEFAULT_SEED },
    });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [key, uncached, data, results]);

  if (uncached.length === 0) {
    return { status: "done", points: sortPoints(cachedPoints), progress: { done: cachedPoints.length, total: cachedPoints.length } };
  }

  const streamed = stream.key === key ? stream.points : [];
  return {
    status: stream.key === key ? stream.workerStatus : "running",
    error: stream.key === key ? stream.error : null,
    points: sortPoints([...cachedPoints, ...streamed]),
    progress: { done: cachedPoints.length + streamed.length, total: cachedPoints.length + uncached.length },
  };
}
