import { useEffect } from "react";
import type { SessionResult } from "../features/session/SessionRunner";
import "../features/session/session.css";

export function SessionComplete({ result, onHome }: { result: SessionResult; onHome: () => void }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      onHome();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onHome]);

  return (
    <section className="session-complete">
      <div aria-hidden="true" className="session-complete__glyph">完</div>
      <h1>세션 완료 · +{result.xp} XP</h1>
      <div className="session-complete__stats">
        <div><small>정확도</small><strong>{result.accuracy}%</strong></div>
        <div><small>최고 콤보</small><strong>{result.bestCombo}×</strong></div>
        <div><small>다음 복습</small><strong>{result.nextReview}</strong></div>
      </div>
      {result.profile && <p>누적 {result.profile.xp.toLocaleString()} XP · 오늘 {result.profile.todayXp}/{result.profile.goal} XP · {result.profile.streak}일 연속</p>}
      <button onClick={onHome} type="button">지도로 돌아가기 <kbd>ENTER</kbd></button>
    </section>
  );
}
