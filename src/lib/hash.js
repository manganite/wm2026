// FNV-1a string hash — fast, deterministic, no dependencies. Used to build
// localStorage cache keys for timeline points (see useTimeline.js).
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// A timeline point is fully determined by its conditioning subset (the only
// part that varies between points), N, seed, and the engine version — bumping
// ENGINE_VERSION invalidates every cached point.
export function timelineCacheKey(pointResults, nRuns, seed, engineVersion) {
  return `tl:${engineVersion}:${seed}:${nRuns}:${fnv1a(JSON.stringify(pointResults.matches))}`;
}
