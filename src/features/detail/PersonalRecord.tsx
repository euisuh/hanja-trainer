import type { CSSProperties } from "react";
import type { ReviewState } from "../../shared/fsrs";
import type { Track } from "../../shared/types";
import { trackThemes } from "../tracks/trackTheme";
import { recordValues } from "./detailModel";

export function PersonalRecord({ active, states, tracks, onChange }: { active: Track; states: ReadonlyMap<Track, ReviewState>; tracks: Track[]; onChange: (track: Track) => void }) {
  const values = recordValues(states.get(active));
  return (
    <section className="personal-record">
      <header>개인 기록</header>
      <div className="personal-record__tracks" aria-label="기록 트랙">
        {tracks.map((track) => <button aria-pressed={active === track} key={track} onClick={() => onChange(track)} style={{ "--detail-accent": trackThemes[track].accent } as CSSProperties} type="button">{track.toUpperCase()}</button>)}
      </div>
      {!values ? <p className="detail-empty">이 트랙은 아직 복습 기록이 없습니다.</p> : (
        <dl>
          <div><dt>정확도</dt><dd>{values.accuracy}</dd></div>
          <div><dt>총 복습</dt><dd>{values.reps}</dd></div>
          <div><dt>다음 만기</dt><dd>{values.due}</dd></div>
          <div><dt>난이도</dt><dd>{values.difficulty}</dd></div>
        </dl>
      )}
    </section>
  );
}
