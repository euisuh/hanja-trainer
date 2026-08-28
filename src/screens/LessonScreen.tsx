import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadOnboardingProfile } from "../features/onboarding/tracks";
import { SessionRunner } from "../features/session/SessionRunner";
import { apiCardsToQueue, queueCharacters } from "../features/session/apiQueue";
import { apiClient } from "../lib/apiClient";
import type { SessionQueueItem } from "../features/session/buildQueue";

export function LessonScreen() {
  const navigate = useNavigate();
  const enabledTracks = useMemo(() => loadOnboardingProfile().enabledTracks, []);
  const [queue, setQueue] = useState<SessionQueueItem[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    apiClient.startSession({ mode: "lesson", tracks: enabledTracks, limit: 8 }, controller.signal)
      .then((result) => setQueue(apiCardsToQueue(result.cards)))
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "레슨을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [enabledTracks]);
  if (error) return <div className="session-empty"><h1>레슨을 불러오지 못했습니다.</h1><p role="alert">{error}</p><button onClick={() => navigate("/home")}>지도로 돌아가기</button></div>;
  if (!queue) return <p>레슨을 불러오는 중…</p>;
  return (
    <SessionRunner
      characters={queueCharacters(queue)}
      enabledTracks={enabledTracks}
      mode="lesson"
      onComplete={(result) => navigate("/session-complete", { state: result })}
      onQuit={() => navigate("/home")}
      queueOverride={queue}
    />
  );
}
