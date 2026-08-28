import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSettings } from "../features/settings/useSettings";
import { SessionRunner } from "../features/session/SessionRunner";
import { apiCardsToQueue, queueCharacters } from "../features/session/apiQueue";
import type { SessionQueueItem } from "../features/session/buildQueue";
import { apiClient } from "../lib/apiClient";

type LoadedSession = { id: string; queue: SessionQueueItem[] };

export function PlacementScreen() {
  const navigate = useNavigate();
  const { enabledTracks, ready } = useSettings();
  const [session, setSession] = useState<LoadedSession | null>(null);
  const [error, setError] = useState("");
  const startedAt = useRef(new Date());
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    apiClient.startSession({ mode: "placement", tracks: enabledTracks, limit: 15 }, controller.signal)
      .then((result) => setSession({ id: result.sessionId, queue: apiCardsToQueue(result.cards) }))
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "배치 문항을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [enabledTracks, ready]);
  if (error) return <div className="session-empty"><h1>배치 문항을 불러오지 못했습니다.</h1><p role="alert">{error}</p><button onClick={() => navigate("/onboarding")}>트랙 선택으로</button></div>;
  if (!ready || !session) return <p>배치 문항을 불러오는 중…</p>;
  return (
    <SessionRunner
      characters={queueCharacters(session.queue)}
      enabledTracks={enabledTracks}
      mode="placement"
      onComplete={async (result) => {
        try {
          const placement = await apiClient.scorePlacement(result.placementAnswers ?? []);
          await apiClient.createSession({ mode: "placement", startedAt: startedAt.current.toISOString(), endedAt: new Date().toISOString(), answered: result.answered, correct: result.correct, bestCombo: result.bestCombo, xp: result.xp });
          navigate("/placement-result", { state: placement });
        } catch {
          setError("배치 결과를 저장하지 못했습니다. 다시 시도해 주세요.");
        }
      }}
      onQuit={() => navigate("/onboarding")}
      queueOverride={session.queue}
      sessionId={session.id}
    />
  );
}
