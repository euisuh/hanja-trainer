import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSettings } from "../features/settings/useSettings";
import "../features/review/review.css";
import { SessionRunner } from "../features/session/SessionRunner";
import { apiCardsToQueue, queueCharacters } from "../features/session/apiQueue";
import type { SessionQueueItem } from "../features/session/buildQueue";
import { apiClient } from "../lib/apiClient";
import type { DueReviewsResponse } from "../shared/api";

type LoadedSession = { id: string; queue: SessionQueueItem[] };

export const REVIEW_SESSION_LENGTH = 20;

export function ReviewScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const { enabledTracks, ready } = useSettings();
  const [session, setSession] = useState<LoadedSession | null>(null);
  const [due, setDue] = useState<DueReviewsResponse | null>(null);
  const [error, setError] = useState("");
  const inSession = location.pathname === "/review/session";
  const startedAt = useRef(new Date());

  useEffect(() => {
    if (inSession) startedAt.current = new Date();
  }, [inSession]);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    Promise.all([
      apiClient.startSession({ mode: "review", tracks: enabledTracks, limit: REVIEW_SESSION_LENGTH }, controller.signal),
      apiClient.dueReviews(enabledTracks, REVIEW_SESSION_LENGTH, controller.signal),
    ]).then(([result, dueReviews]) => {
      setSession({ id: result.sessionId, queue: apiCardsToQueue(result.cards) });
      setDue(dueReviews);
    })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "복습 큐를 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [enabledTracks, ready]);

  useEffect(() => {
    if (inSession || !session || session.queue.length === 0) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter") return;
      if (event.target instanceof HTMLElement && event.target.matches("button, a")) return;
      event.preventDefault();
      navigate("/review/session");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inSession, navigate, session]);

  if (error) return <section className="review-screen"><h1>복습 큐</h1><p role="alert">{error}</p></section>;
  if (!ready || !session || !due) return <p>복습 큐를 불러오는 중…</p>;

  if (inSession) {
    return (
      <SessionRunner
        characters={queueCharacters(session.queue)}
        enabledTracks={enabledTracks}
        mode="review"
        onComplete={async (result) => {
          try {
            const profile = await apiClient.createSession({ mode: "review", startedAt: startedAt.current.toISOString(), endedAt: new Date().toISOString(), answered: result.answered, correct: result.correct, bestCombo: result.bestCombo, xp: result.xp });
            navigate("/session-complete", { state: { ...result, profile } });
          } catch {
            navigate("/session-complete", { state: result });
          }
        }}
        onQuit={() => navigate("/review")}
        queueOverride={session.queue}
        sessionId={session.id}
      />
    );
  }

  return (
    <section className="review-screen">
      <h1>복습 큐</h1>
      <p>FSRS 만기 카드만 뽑습니다. 신규 학습과 분리된 세션입니다.</p>
      {due.total === 0 ? (
        <div className="review-empty">
          <span aria-hidden="true" className="review-empty__glyph">完</span>
          <strong>오늘 복습할 카드가 없습니다</strong>
          <Link to="/lesson">새 레슨 시작하기</Link>
        </div>
      ) : (
        <>
          <button className="review-start" onClick={() => navigate("/review/session")} type="button">{due.total}장 복습 시작 <kbd>ENTER</kbd></button>
          <div className="due-list">{due.cards.map((item) => <button className="due-row" key={`${item.characterKey}:${item.track}`} onClick={() => navigate(`/detail/${encodeURIComponent(item.characterKey)}`, { state: { from: "/review" } })} type="button"><span className={`due-row__glyph due-row__glyph--${item.track}`}>{item.glyph}</span><span className="due-row__copy"><strong>{item.characterKey}</strong><small>{item.reading}</small></span><span className="due-row__when">{item.overdueDays > 0 ? `${item.overdueDays}일 지남` : "오늘 만기"}</span></button>)}</div>
        </>
      )}
    </section>
  );
}
