import { useState, type CSSProperties } from "react";
import type { ExampleSentence, TrackEntry } from "../../shared/types";
import { trackThemes } from "../tracks/trackTheme";

function Reading({ entry }: { entry: TrackEntry }) {
  if (entry.track === "kr") return <><strong>{entry.reading}</strong><div className="track-panel__badges"><span>한자 {entry.level}</span></div></>;
  if (entry.track === "jp") return <><strong>音 {entry.on}</strong><p className="track-panel__subreading">訓 {entry.kun}</p><div className="track-panel__badges"><span>漢検 {entry.kanken}</span><span>{entry.jlpt}</span></div></>;
  return <><strong>{entry.pinyin}</strong><div className="track-panel__badges"><span>{entry.hsk}</span><span>{entry.tier}</span></div></>;
}

export function TrackPanel({ entry, sentences }: { entry: TrackEntry; sentences: ExampleSentence[] }) {
  const [expanded, setExpanded] = useState(false);
  const theme = trackThemes[entry.track];
  const visible = expanded ? sentences : sentences.slice(0, 1);
  return (
    <article className="track-panel" style={{ "--detail-accent": theme.accent, "--detail-soft": theme.soft, "--detail-font": theme.font } as CSSProperties}>
      <header>{theme.badge}</header>
      <Reading entry={entry} />
      {visible.length === 0 ? <p className="track-panel__empty">확인된 예문이 없습니다.</p> : visible.map((sentence) => (
        <div className="track-panel__sentence" key={sentence.id}>
          <p>{sentence.text}</p><small>{sentence.translationKo}</small>
        </div>
      ))}
      {sentences.length > 1 && <button className="track-panel__more" onClick={() => setExpanded((value) => !value)} type="button">{expanded ? "예문 접기" : `+${sentences.length - 1} 예문`}</button>}
    </article>
  );
}
