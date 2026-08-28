export function ComboBadge({ combo }: { combo: number }) {
  if (combo < 2) return null;
  return <span className="combo-badge" key={combo}>{combo}× 콤보</span>;
}
