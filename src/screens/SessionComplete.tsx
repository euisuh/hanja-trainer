import { useEffect, useRef, useState } from "react";
import { ParticleBurst } from "../features/session/ParticleBurst";
import type { SessionResult } from "../features/session/SessionRunner";
import { useCountUp } from "../features/session/useCountUp";
import "../features/session/session.css";

export function completeHeadline(accuracy: number): string {
  if (accuracy >= 95) return "완벽했어요";
  if (accuracy >= 80) return "잘했어요";
  if (accuracy >= 60) return "좋아요";
  return "끝까지 했어요";
}

export function SessionComplete({ result, onHome }: { result: SessionResult; onHome: () => void }) {
  const unitTest = result.unitTest;
  const [celebrating, setCelebrating] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownXp = useCountUp(result.xp);
  const shouldCelebrate = !unitTest || unitTest.passed;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!shouldCelebrate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setTimeout(() => setCelebrating(true), 180);
    return () => window.clearTimeout(timer);
  }, [shouldCelebrate]);

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
      <div aria-hidden="true" className="celebration-layer">
        {celebrating && <ParticleBurst anchor={{ x: 60, y: 60, width: 120, height: 120 }} onDone={() => setCelebrating(false)} tier={result.accuracy >= 90 ? 3 : result.accuracy >= 70 ? 2 : 1} track="kr" />}
      </div>
      <div aria-hidden="true" className="session-complete__glyph">{unitTest ? "跳" : "完"}</div>
      <h1 ref={headingRef} tabIndex={-1}>
        {unitTest
          ? unitTest.passed ? "유닛을 건너뛰었어요" : "유닛 테스트 실패"
          : <>{completeHeadline(result.accuracy)} <span aria-hidden="true" className="session-complete__xp">+{shownXp} XP</span><span className="session-announcement">+{result.xp} XP</span></>}
      </h1>
      {unitTest && <p>필수 정답 {unitTest.correct}/{unitTest.required} · 실수 {unitTest.mistakes}/3</p>}
      <div className="session-complete__stats">
        <div><small>정확도</small><strong>{result.accuracy}%</strong></div>
        <div><small>응답</small><strong>{result.answered}</strong></div>
        <div><small>최고 콤보</small><strong>{result.bestCombo}×</strong></div>
        <div><small>다음 복습</small><strong>{result.nextReview}</strong></div>
        {result.skipped > 0 && <div className="session-complete__stat--quiet"><small>모름</small><strong>{result.skipped}회</strong></div>}
      </div>
      {result.profile && (
        <div className="session-complete__profile">
          <span><small>연속</small><strong>{result.profile.streak}일</strong></span>
          <span><small>오늘</small><strong>{result.profile.todayXp}/{result.profile.goal} XP</strong></span>
          <span><small>누적</small><strong>{result.profile.xp.toLocaleString()} XP</strong></span>
        </div>
      )}
      <button onClick={onHome} type="button">{unitTest ? unitTest.passed ? "다음 유닛으로" : "현재 유닛으로" : "지도로 가기"} <kbd>ENTER</kbd></button>
    </section>
  );
}
