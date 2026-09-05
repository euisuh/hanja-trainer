import type { CSSProperties } from "react";
import { colors, tracks } from "../../design/tokens";
import type { Track } from "../../shared/types";

export type BurstAnchor = { x: number; y: number; width: number; height: number };
type Props = { anchor: BurstAnchor; onDone: () => void; tier: 1 | 2 | 3; track: Track };

export function ParticleBurst({ anchor, onDone, tier, track }: Props) {
  const count = tier === 3 ? 44 : tier === 2 ? 34 : 28;
  const palette = tier === 3
    ? [colors.gold, colors.gold, colors.flame, tracks[track].accent, colors.correct]
    : [colors.gold, colors.correct, tracks[track].accent, colors.ink];
  const origin = { "--burst-x": `${anchor.x}px`, "--burst-y": `${anchor.y}px` } as CSSProperties;
  return (
    <div className="particle-burst" data-tier={tier} onAnimationEnd={(event) => { if (event.target === event.currentTarget) onDone(); }} style={origin}>
      {tier >= 2 && <i className="particle-burst__ring" />}
      {tier === 3 && <i className="particle-burst__flare" />}
      {Array.from({ length: count }, (_, index) => {
        const angle = index / count * Math.PI * 2;
        const distance = 146 + tier * 16 + index % 4 * 48;
        const style = {
          "--tx": `${Math.round(Math.cos(angle) * distance)}px`,
          "--ty": `${Math.round(Math.sin(angle) * distance)}px`,
          "--particle": palette[index % palette.length],
          "--size": `${index % 4 === 0 ? 24 + tier * 3 : 12 + tier * 1.5}px`,
        } as CSSProperties;
        return <span className={`particle-burst__particle${index % 2 ? " particle-burst__circle" : ""}`} key={index} style={style} />;
      })}
    </div>
  );
}
