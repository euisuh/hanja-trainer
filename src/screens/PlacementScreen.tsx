import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadOnboardingProfile, savePlacementResults } from "../features/onboarding/tracks";
import { SessionRunner } from "../features/session/SessionRunner";
import { apiCardsToQueue, queueCharacters } from "../features/session/apiQueue";
import type { SessionQueueItem } from "../features/session/buildQueue";
import { apiClient } from "../lib/apiClient";

export function PlacementScreen() {
  const navigate = useNavigate();
  const enabledTracks = useMemo(() => loadOnboardingProfile().enabledTracks, []);
  const [queue, setQueue] = useState<SessionQueueItem[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    apiClient.startSession({ mode: "placement", tracks: enabledTracks, limit: 15 }, controller.signal)
      .then((result) => setQueue(apiCardsToQueue(result.cards)))
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "배치 문항을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [enabledTracks]);
  if (error) return <div className="session-empty"><h1>배치 문항을 불러오지 못했습니다.</h1><p role="alert">{error}</p><button onClick={() => navigate("/onboarding")}>트랙 선택으로</button></div>;
  if (!queue) return <p>배치 문항을 불러오는 중…</p>;
  return (
    <SessionRunner
      characters={queueCharacters(queue)}
      enabledTracks={enabledTracks}
      mode="placement"
      onComplete={(result) => {
        savePlacementResults(result.placement ?? []);
        navigate("/placement-result");
      }}
      onQuit={() => navigate("/onboarding")}
      queueOverride={queue}
    />
  );
}
