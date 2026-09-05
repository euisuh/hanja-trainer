type Props = { combo: number };

const TIERS = [
  { min: 2, tier: 1, label: "콤보" },
  { min: 3, tier: 2, label: "좋아요" },
  { min: 6, tier: 3, label: "불붙었어요" },
  { min: 10, tier: 4, label: "무결점" },
] as const;

export function ComboBadge({ combo }: Props) {
  if (combo < 2) return null;
  const step = [...TIERS].reverse().find((entry) => combo >= entry.min) ?? TIERS[0];
  return (
    <span className="combo-badge" data-tier={step.tier} key={combo}>
      {combo}× {step.label}
    </span>
  );
}
