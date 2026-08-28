import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { DueList, buildDueItems } from "../features/review/DueList";
import "../features/review/review.css";
import { SessionRunner } from "../features/session/SessionRunner";
import { demoCharacters, loadDemoStates, persistDemoAnswer } from "../features/session/demoData";

export const REVIEW_SESSION_LENGTH = 20;
const enabledTracks = ["kr", "jp", "cn"] as const;

export function ReviewScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const states = loadDemoStates();
  const due = buildDueItems(demoCharacters, states, [...enabledTracks]);
  const inSession = location.pathname === "/review/session";

  useEffect(() => {
    if (inSession || due.length === 0) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter") return;
      if (event.target instanceof HTMLElement && event.target.matches("button, a")) return;
      event.preventDefault();
      navigate("/review/session");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [due.length, inSession, navigate]);

  if (inSession) {
    return (
      <SessionRunner
        characters={demoCharacters}
        enabledTracks={[...enabledTracks]}
        initialReviewStates={states}
        length={Math.min(REVIEW_SESSION_LENGTH, due.length)}
        mode="review"
        onComplete={(result) => navigate("/session-complete", { state: result })}
        onPersist={persistDemoAnswer}
        onQuit={() => navigate("/review")}
      />
    );
  }

  return (
    <section className="review-screen">
      <h1>복습 큐</h1>
      <p>FSRS 만기 카드만 뽑습니다. 신규 학습과 분리된 세션입니다.</p>
      {due.length === 0 ? (
        <div className="review-empty">
          <span aria-hidden="true" className="review-empty__glyph">完</span>
          <strong>오늘 복습할 카드가 없습니다</strong>
          <Link to="/lesson">새 레슨 시작하기</Link>
        </div>
      ) : (
        <>
          <button className="review-start" onClick={() => navigate("/review/session")} type="button">{due.length}장 복습 시작 <kbd>ENTER</kbd></button>
          <DueList items={due} onOpen={(item) => navigate(`/detail/${encodeURIComponent(item.character.key)}`)} />
        </>
      )}
    </section>
  );
}
