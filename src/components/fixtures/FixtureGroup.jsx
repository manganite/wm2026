import { FixtureRow } from "./FixtureRow.jsx";

// One labelled cluster of fixtures — a group's 6 matches, or one knockout
// stage's matches.
export function FixtureGroup({ title, rows, teamsByCode }) {
  return (
    <div className="section">
      <h3>{title}</h3>
      {rows.map((row) => (
        <FixtureRow key={row.id} row={row} teamsByCode={teamsByCode} />
      ))}
    </div>
  );
}
