import type { CSSProperties } from "react";
import type { Track } from "../../../shared/types";
import { trackThemes } from "./trackTheme";

export function TrackTabs({ active, enabled, onChange }: { active: Track; enabled: Track[]; onChange: (track: Track) => void }) {
  return (
    <div className="track-tabs" aria-label="학습 트랙">
      {enabled.map((track) => {
        const theme = trackThemes[track];
        return (
          <button
            aria-pressed={active === track}
            className="track-tab"
            key={track}
            lang={theme.lang}
            onClick={() => onChange(track)}
            style={{ "--track-accent": theme.accent, "--track-accent-text": theme.accentText } as CSSProperties}
            type="button"
          >{theme.label}</button>
        );
      })}
    </div>
  );
}
