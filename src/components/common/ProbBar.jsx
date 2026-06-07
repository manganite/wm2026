// Inline probability bar: a filled track with the percentage label on top.
// Reused across the outlook table, match predictions, and bracket slots.
export function ProbBar({ value, decimals = 1 }) {
  const pct = value * 100;
  return (
    <span className="prob-bar" title={`${pct.toFixed(decimals)}%`}>
      <span style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      <em>{pct.toFixed(decimals)}%</em>
    </span>
  );
}
