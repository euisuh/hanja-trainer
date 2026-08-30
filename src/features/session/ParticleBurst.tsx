import type { CSSProperties } from "react";
import { colors, tracks } from "../../design/tokens";
import type { Track } from "../../shared/types";

type Props = { onDone: () => void; tier: 1 | 2 | 3; track: Track };

export function ParticleBurst({ onDone, tier, track }: Props) {
  const count = tier === 3 ? 36 : tier === 2 ? 28 : 22;
  const palette = tier === 3
    ? [colors.gold, colors.gold, colors.flame, tracks[track].accent, colors.correct]
    : [colors.gold, colors.correct, tracks[track].accent, colors.ink];
  return (
    <div className="particle-burst" data-tier={tier} onAnimationEnd={(event) => { if (event.target === event.currentTarget) onDone(); }}>
      {tier >= 2 && <i className="particle-burst__ring" />}
      {tier === 3 && <i className="particle-burst__flare" />}
      {Array.from({ length: count }, (_, index) => {
        const angle = index / count * Math.PI * 2;
        const distance = 112 + tier * 12 + index % 4 * 38;
        const style = {
          "--tx": `${Math.round(Math.cos(angle) * distance)}px`,
          "--ty": `${Math.round(Math.sin(angle) * distance)}px`,
          "--particle": palette[index % palette.length],
          "--size": `${index % 4 === 0 ? 18 + tier * 2 : 9 + tier}px`,
        } as CSSProperties;
        return <span className={`particle-burst__particle${index % 2 ? " particle-burst__circle" : ""}`} key={index} style={style} />;
      })}
    </div>
  );
}
