import type { CSSProperties } from "react";
import { tracks } from "../../design/tokens";
import type { Track } from "../../shared/types";

export function ParticleBurst({ track }: { track: Track }) {
  return (
    <div className="particle-burst" aria-hidden="true">
      {Array.from({ length: 14 }, (_, index) => {
        const angle = index / 14 * Math.PI * 2;
        const distance = 90 + index % 3 * 46;
        const style = {
          "--tx": `${Math.round(Math.cos(angle) * distance)}px`,
          "--ty": `${Math.round(Math.sin(angle) * distance)}px`,
          "--particle": ["#E8B33D", "#12855A", tracks[track].accent, "#16130F"][index % 4],
          "--size": `${index % 3 === 0 ? 16 : 10}px`,
        } as CSSProperties;
        return <span className={index % 2 ? "particle-burst__circle" : ""} key={index} style={style} />;
      })}
    </div>
  );
}
