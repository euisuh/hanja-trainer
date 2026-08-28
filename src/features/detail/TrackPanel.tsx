import { useState, type CSSProperties } from "react";
import type { ApiTrackDetail } from "../../shared/api";
import { trackThemes } from "../tracks/trackTheme";

export function TrackPanel({ entry }: { entry: ApiTrackDetail }) {
  const [expanded, setExpanded] = useState(false);
  const theme = trackThemes[entry.track];
  const visible = expanded ? entry.sentences : entry.sentences.slice(0, 1);
  return (
    <article className="track-panel" style={{ "--detail-accent": theme.accent, "--detail-soft": theme.soft, "--detail-font": theme.font } as CSSProperties}>
      <header>{theme.badge}</header>
      <strong>{entry.reading}</strong>
      {entry.subreading && <p className="track-panel__subreading">{entry.subreading}</p>}
      <div className="track-panel__badges">{entry.level_badges.map((badge) => <span key={badge}>{badge}</span>)}</div>
      {visible.length === 0 ? <p className="track-panel__empty">확인된 예문이 없습니다.</p> : visible.map((sentence) => (
        <div className="track-panel__sentence" key={`${sentence.target_index}:${sentence.text}`}>
          <p>{sentence.text}</p><small>{sentence.translation}</small>
        </div>
      ))}
      {entry.sentences.length > 1 && <button className="track-panel__more" onClick={() => setExpanded((value) => !value)} type="button">{expanded ? "예문 접기" : `+${entry.sentences.length - 1} 예문`}</button>}
    </article>
  );
}
