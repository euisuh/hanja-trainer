import { useEffect } from "react";
import type { SessionResult } from "../features/session/SessionRunner";
import "../features/session/session.css";

export function SessionComplete({ result, onHome }: { result: SessionResult; onHome: () => void }) {
  const unitTest = result.unitTest;
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
      <div aria-hidden="true" className="session-complete__glyph">{unitTest ? "跳" : "完"}</div>
      <h1>{unitTest ? unitTest.passed ? "유닛 건너뛰기 성공" : "유닛 테스트 실패" : `세션 완료 · +${result.xp} XP`}</h1>
      {unitTest && <p>정답 {unitTest.correct}/{unitTest.total} · 각 글자를 두 번 모두 맞혀야 통과합니다.</p>}
      <div className="session-complete__stats">
        <div><small>응답</small><strong>{result.answered}</strong></div>
        <div><small>정확도</small><strong>{result.accuracy}%</strong></div>
        <div><small>모름</small><strong>{result.skipped}회</strong></div>
        <div><small>최고 콤보</small><strong>{result.bestCombo}×</strong></div>
        <div><small>다음 복습</small><strong>{result.nextReview}</strong></div>
      </div>
      {result.profile && <p>누적 {result.profile.xp.toLocaleString()} XP · 오늘 {result.profile.todayXp}/{result.profile.goal} XP · {result.profile.streak}일 연속</p>}
      <button onClick={onHome} type="button">{unitTest ? unitTest.passed ? "다음 유닛으로" : "현재 유닛으로" : "지도로 돌아가기"} <kbd>ENTER</kbd></button>
    </section>
  );
}
