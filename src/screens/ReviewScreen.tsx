import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { loadOnboardingProfile } from "../features/onboarding/tracks";
import "../features/review/review.css";
import { SessionRunner } from "../features/session/SessionRunner";
import { apiCardsToQueue, queueCharacters } from "../features/session/apiQueue";
import type { SessionQueueItem } from "../features/session/buildQueue";
import { apiClient } from "../lib/apiClient";

export const REVIEW_SESSION_LENGTH = 20;

export function ReviewScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const enabledTracks = useMemo(() => loadOnboardingProfile().enabledTracks, []);
  const [queue, setQueue] = useState<SessionQueueItem[] | null>(null);
  const [error, setError] = useState("");
  const inSession = location.pathname === "/review/session";

  useEffect(() => {
    const controller = new AbortController();
    apiClient.startSession({ mode: "review", tracks: enabledTracks, limit: REVIEW_SESSION_LENGTH }, controller.signal)
      .then((result) => setQueue(apiCardsToQueue(result.cards)))
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "복습 큐를 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [enabledTracks]);

  useEffect(() => {
    if (inSession || !queue || queue.length === 0) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter") return;
      if (event.target instanceof HTMLElement && event.target.matches("button, a")) return;
      event.preventDefault();
      navigate("/review/session");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inSession, navigate, queue]);

  if (error) return <section className="review-screen"><h1>복습 큐</h1><p role="alert">{error}</p></section>;
  if (!queue) return <p>복습 큐를 불러오는 중…</p>;

  if (inSession) {
    return (
      <SessionRunner
        characters={queueCharacters(queue)}
        enabledTracks={enabledTracks}
        mode="review"
        onComplete={(result) => navigate("/session-complete", { state: result })}
        onQuit={() => navigate("/review")}
        queueOverride={queue}
      />
    );
  }

  return (
    <section className="review-screen">
      <h1>복습 큐</h1>
      <p>FSRS 만기 카드만 뽑습니다. 신규 학습과 분리된 세션입니다.</p>
      {queue.length === 0 ? (
        <div className="review-empty">
          <span aria-hidden="true" className="review-empty__glyph">完</span>
          <strong>오늘 복습할 카드가 없습니다</strong>
          <Link to="/lesson">새 레슨 시작하기</Link>
        </div>
      ) : (
        <>
          <button className="review-start" onClick={() => navigate("/review/session")} type="button">{queue.length}장 복습 시작 <kbd>ENTER</kbd></button>
          <div className="due-list">{queue.map((item, index) => <button className="due-row" key={`${item.character.key}:${item.track}:${index}`} onClick={() => navigate(`/detail/${encodeURIComponent(item.character.key)}`, { state: { from: "/review" } })} type="button"><span className={`due-row__glyph due-row__glyph--${item.track}`}>{item.character.tracks.find((entry) => entry.track === item.track)?.glyph}</span><span className="due-row__copy"><strong>{item.character.key}</strong><small>{item.kind === "reading" ? item.options[item.answerIndex]?.label : "교차 강화"}</small></span><span className="due-row__when">만기</span></button>)}</div>
        </>
      )}
    </section>
  );
}
