import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadOnboardingProfile, savePlacementResults } from "../features/onboarding/tracks";
import { SessionRunner } from "../features/session/SessionRunner";
import { apiCardsToQueue, queueCharacters } from "../features/session/apiQueue";
import type { SessionQueueItem } from "../features/session/buildQueue";
import { apiClient } from "../lib/apiClient";

type LoadedSession = { id: string; queue: SessionQueueItem[] };

export function PlacementScreen() {
  const navigate = useNavigate();
  const enabledTracks = useMemo(() => loadOnboardingProfile().enabledTracks, []);
  const [session, setSession] = useState<LoadedSession | null>(null);
  const [error, setError] = useState("");
  const startedAt = useRef(new Date());
  useEffect(() => {
    const controller = new AbortController();
    apiClient.startSession({ mode: "placement", tracks: enabledTracks, limit: 15 }, controller.signal)
      .then((result) => setSession({ id: result.sessionId, queue: apiCardsToQueue(result.cards) }))
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "배치 문항을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [enabledTracks]);
  if (error) return <div className="session-empty"><h1>배치 문항을 불러오지 못했습니다.</h1><p role="alert">{error}</p><button onClick={() => navigate("/onboarding")}>트랙 선택으로</button></div>;
  if (!session) return <p>배치 문항을 불러오는 중…</p>;
  return (
    <SessionRunner
      characters={queueCharacters(session.queue)}
      enabledTracks={enabledTracks}
      mode="placement"
      onComplete={async (result) => {
        savePlacementResults(result.placement ?? []);
        try {
          await apiClient.createSession({ mode: "placement", startedAt: startedAt.current.toISOString(), endedAt: new Date().toISOString(), answered: result.answered, correct: result.correct, bestCombo: result.bestCombo, xp: result.xp });
        } catch {
          // Placement results remain local until the next profile sync.
        }
        navigate("/placement-result");
      }}
      onQuit={() => navigate("/onboarding")}
      queueOverride={session.queue}
      sessionId={session.id}
    />
  );
}
