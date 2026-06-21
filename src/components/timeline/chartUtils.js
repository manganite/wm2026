// Small SVG-chart helpers shared by the Timeline visualizations (V1/V3/V4) —
// kept tiny and dependency-free since this app hand-rolls its charts.
import { T0, matchesOnDate } from "../../lib/timeline.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_MOVERS = 5;

// Maps a timeline point's date (T0 or "YYYY-MM-DD") to an x pixel in
// [0, innerWidth], for the fixed range [t0Date - 1 day, endDate]. T0 maps to
// the left edge regardless of how many results have been entered, so
// stage-boundary markers stay put as the timeline grows.
export function buildXScaleForRange(t0Date, endDate, innerWidth) {
  const t0Ms = Date.parse(t0Date) - DAY_MS;
  const endMs = Date.parse(endDate);
  const span = endMs - t0Ms;
  return (date) => {
    const ms = date === T0 ? t0Ms : Date.parse(`${date}T00:00:00Z`);
    return ((ms - t0Ms) / span) * innerWidth;
  };
}

// x-scale spanning the whole tournament — T0 through the Final's date.
export function buildXScale(boundaries, innerWidth) {
  return buildXScaleForRange(boundaries.groupsStart, boundaries.F, innerWidth);
}

// Two-segment linear scale: allocates more width to the data region (up to
// lastDataDate) so early-tournament charts aren't 85% empty. Falls back to
// a single linear scale when the tournament is nearly complete.
export function buildXScaleAdaptive(t0Date, endDate, lastDataDate, innerWidth, dataFraction = 0.65) {
  const t0Ms = Date.parse(t0Date) - DAY_MS;
  const endMs = Date.parse(endDate);
  const lastMs = Date.parse(`${lastDataDate}T00:00:00Z`);
  const totalSpan = endMs - t0Ms;
  const dataSpan = lastMs - t0Ms;
  if (dataSpan <= 0 || dataSpan >= totalSpan * 0.8) {
    return buildXScaleForRange(t0Date, endDate, innerWidth);
  }
  const splitX = dataFraction * innerWidth;
  const futureSpan = endMs - lastMs;
  return (date) => {
    const ms = date === T0 ? t0Ms : Date.parse(`${date}T00:00:00Z`);
    if (ms <= lastMs) {
      return ((ms - t0Ms) / dataSpan) * splitX;
    }
    return splitX + ((ms - lastMs) / futureSpan) * (innerWidth - splitX);
  };
}

// Stage-boundary markers (groups end, R32, R16, ...) can land only a few
// pixels apart — e.g. groups end and R32 are one day apart on a 38-day axis —
// which makes their text labels overlap. Group markers whose x-positions fall
// within `threshold` px into a single cluster: one combined "A / B" label
// (centered on the cluster) but a vertical line per marker, so the lines stay
// at their true dates while the labels stay readable.
export function clusterStageMarkers(markers, boundaries, xOf, threshold = 36) {
  const clusters = [];
  for (const { key, label } of markers) {
    const x = xOf(boundaries[key]);
    const prev = clusters[clusters.length - 1];
    if (prev && x - prev.lines[prev.lines.length - 1] < threshold) {
      prev.lines.push(x);
      prev.labels.push(label);
    } else {
      clusters.push({ lines: [x], labels: [label] });
    }
  }
  return clusters.map(({ lines, labels }) => ({
    lines,
    label: labels.join(" / "),
    x: lines.reduce((a, b) => a + b, 0) / lines.length,
  }));
}

// SVG path "M x,y L x,y ..." for one series, one value per timeline point.
export function linePath(points, xOf, yOf, accessor) {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.date).toFixed(2)},${yOf(accessor(p)).toFixed(2)}`)
    .join(" ");
}

export function formatPointDate(date) {
  if (date === T0) return "Pre-tournament";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// Group-stage fixtures store home/away as plain team codes; knockout fixtures
// store {run:"A"}-style refs that only resolve once earlier rounds are
// decided. `resolution` is the Map returned by buildKnockoutResolution(data,
// results) for the *current* real results.
export function resolveMatchTeams(fixture, resolution) {
  if (typeof fixture.home === "string") return { home: fixture.home, away: fixture.away };
  const r = resolution?.get(fixture.id);
  return { home: r?.home ?? null, away: r?.away ?? null };
}

// For each consecutive pair of timeline points, the matches played on the
// later point's date and the biggest title-probability movers those results
// produced (the deltas behind V1's lines). Shared by MatchImpactPanel (full
// reverse-chronological list) and LatestResultsCard (just the last entry).
export function computeImpactEntries(points, teams, fixtures, results) {
  const out = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const movers = teams
      .map((t) => ({ code: t.code, delta: curr.probs[t.code].W - prev.probs[t.code].W }))
      .filter((m) => Math.abs(m.delta) > 0.0005)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, TOP_MOVERS);
    out.push({ date: curr.date, matches: matchesOnDate(fixtures, results, curr.date), movers });
  }
  return out;
}
