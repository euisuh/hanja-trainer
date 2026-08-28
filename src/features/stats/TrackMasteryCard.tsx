import type { CSSProperties, Ref } from "react";
import type { Track } from "../../shared/types";
import { trackThemes } from "../tracks/trackTheme";
import type { LevelProgress } from "./levelProgress";

const copy = {
  kr: { unit: "자", suffix: "까지", separator: "", current: "현재", next: "다음", start: "시작 전" },
  jp: { unit: "字", suffix: "まで", separator: "", current: "現在", next: "次", start: "開始前" },
  cn: { unit: "字", suffix: "目标", separator: " ", current: "当前", next: "下一", start: "开始前" },
} as const;

type Props = {
  cardRef: Ref<HTMLElement>;
  index: number;
  progress: LevelProgress;
  totalCards: number;
  track: Track;
  onMove: (index: number) => void;
};

export function TrackMasteryCard({ cardRef, index, progress, totalCards, track, onMove }: Props) {
  const theme = trackThemes[track];
  const labels = copy[track];
  const current = progress.currentLevel === "시작 전" ? labels.start : progress.currentLevel;
  return (
    <article
      className="track-mastery-card"
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        onMove(Math.max(0, Math.min(totalCards - 1, index + (event.key === "ArrowRight" ? 1 : -1))));
      }}
      ref={cardRef}
      style={{ "--stats-accent": theme.accent } as CSSProperties}
      tabIndex={0}
    >
      <small>{theme.label}</small>
      <strong>{Math.round(progress.pct)}%</strong>
      <p>{progress.known}/{progress.total}{labels.unit} · {theme.scaleGoal}{labels.separator}{labels.suffix}</p>
      <div aria-label={`${theme.label} 숙달 ${Math.round(progress.pct)}%`} className="track-mastery-card__bar" role="progressbar" aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round(progress.pct)}><span style={{ width: `${progress.pct}%` }} /></div>
      <footer><span>{labels.current} {current}</span><span>{progress.nextLevel ? `${labels.next} ${progress.nextLevel}` : "최고 단계"}</span></footer>
    </article>
  );
}
