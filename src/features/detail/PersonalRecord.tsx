import type { CSSProperties } from "react";
import type { ApiReviewState } from "../../shared/api";
import type { Track } from "../../shared/types";
import { trackThemes } from "../tracks/trackTheme";

export function PersonalRecord({ active, states, tracks, onChange, now }: { active: Track; states: ReadonlyMap<Track, ApiReviewState>; tracks: Track[]; onChange: (track: Track) => void; now: number }) {
  const state = states.get(active);
  const accuracy = state && state.total_count > 0 ? Math.round(state.correct_count / state.total_count * 100) : 0;
  const due = state ? new Date(state.due) : null;
  const dueLabel = due ? due.getTime() <= now ? "지금" : `${Math.max(1, Math.ceil((due.getTime() - now) / 86_400_000))}일 후` : "";
  return (
    <section className="personal-record">
      <header>개인 기록</header>
      <div className="personal-record__tracks" aria-label="기록 트랙">
        {tracks.map((track) => <button aria-pressed={active === track} key={track} onClick={() => onChange(track)} style={{ "--detail-accent": trackThemes[track].accent } as CSSProperties} type="button">{track.toUpperCase()}</button>)}
      </div>
      {!state ? <p className="detail-empty">이 트랙은 아직 복습 기록이 없습니다.</p> : (
        <dl>
          <div><dt>정확도</dt><dd>{accuracy}%</dd></div>
          <div><dt>총 복습</dt><dd>{state.reps}회</dd></div>
          <div><dt>다음 만기</dt><dd>{dueLabel}</dd></div>
          <div><dt>난이도</dt><dd>{state.difficulty.toFixed(1)} / 10</dd></div>
        </dl>
      )}
    </section>
  );
}
