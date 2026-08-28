import type { CSSProperties } from "react";
import { TRACKS, type Track } from "../../shared/types";
import { trackThemes } from "../tracks/trackTheme";

const states = {
  kr: { on: "사용 중", off: "꺼짐" },
  jp: { on: "使用中", off: "OFF" },
  cn: { on: "开启", off: "关闭" },
} as const;

export function TrackToggles({ enabled, onToggle }: { enabled: Track[]; onToggle: (track: Track) => void }) {
  return (
    <section className="settings-card track-toggles">
      <header>트랙 사용</header>
      <div>
        {TRACKS.map((track) => {
          const active = enabled.includes(track);
          const theme = trackThemes[track];
          return <button aria-pressed={active} key={track} onClick={() => onToggle(track)} style={{ "--settings-accent": theme.accent, "--settings-soft": theme.soft } as CSSProperties} type="button"><span>{theme.label}</span><small>{active ? states[track].on : states[track].off}</small></button>;
        })}
      </div>
    </section>
  );
}
