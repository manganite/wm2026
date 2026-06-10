// Fixed qualitative palette for the Timeline charts (V1/V3/V4) — colors are
// assigned by rank so a team keeps the same color across the whole timeline,
// even though early-tournament probabilities are near-uniform and the
// top-N order can reshuffle slightly point to point.
const PALETTE = [
  "#1d4ed8", // blue
  "#dc2626", // red
  "#16a34a", // green
  "#ea580c", // orange
  "#9333ea", // purple
  "#0891b2", // cyan
  "#ca8a04", // amber
  "#db2777", // pink
  "#4d7c0f", // olive
  "#0f766e", // teal
  "#7c3aed", // violet
  "#b45309", // brown
];

// "Field" = every team outside the shown set, aggregated into one muted line.
export const FIELD_CODE = "Field";
export const FIELD_COLOR = "#9aa0ad";

// codes: ordered list of team codes (e.g. by current title probability).
// Returns { [code]: hexColor, [FIELD_CODE]: FIELD_COLOR }.
export function assignTeamColors(codes) {
  const colors = { [FIELD_CODE]: FIELD_COLOR };
  codes.forEach((code, i) => {
    colors[code] = PALETTE[i % PALETTE.length];
  });
  return colors;
}
