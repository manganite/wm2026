// Single place for the GitHub repo coordinates and simulation defaults.
// Keep GITHUB_REPO in sync with vite.config.js's `base`.
export const GITHUB_OWNER = "manganite";
export const GITHUB_REPO = "wm2026";
export const GITHUB_BRANCH = "main";

// Fetched preferentially so a hand-edit + commit to data/results.json updates
// the live site without a rebuild. Falls back to the bundled copy on failure
// (e.g. before the repo exists, CORS issues, offline dev).
export const RESULTS_RAW_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/data/results.json`;

export const DEFAULT_RUNS = 15000;
export const MAX_RUNS = 100000;
export const DEFAULT_SEED = 12345;

// How often the live site re-checks results.json for updates (ms).
export const RESULTS_POLL_INTERVAL_MS = 60_000;
