import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useSettings } from "../features/settings/useSettings";
import { SessionRunner } from "../features/session/SessionRunner";
import { useActiveProfile } from "../features/profile/ProfileContext";
import { apiCardsToQueue, queueCharacters } from "../features/session/apiQueue";
import { enqueuePendingSummary } from "../features/session/useSessionSummary";
import type { SessionQueueItem } from "../../shared/buildQueue";
import { apiClient } from "../lib/apiClient";
import { TRACKS } from "../../shared/types";

type LoadedSession = { id: string; queue: SessionQueueItem[] };

export function PlacementScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const { id: profileId } = useActiveProfile();
  const { enabledTracks, onyomiScript, soundMode, error: settingsError, ready, retry: retrySettings } = useSettings();
  const retestRequested = location.state !== null;
  const requestedTrack = (location.state as { track?: unknown } | null)?.track;
  const requestedRetestTrack = TRACKS.find((track) => track === requestedTrack);
  const retestTrack = requestedRetestTrack && enabledTracks.includes(requestedRetestTrack) ? requestedRetestTrack : undefined;
  const sessionTracks = useMemo(() => retestTrack ? [retestTrack] : enabledTracks, [enabledTracks, retestTrack]);
  const returnTo = retestTrack ? "/settings" : "/onboarding";
  const [session, setSession] = useState<LoadedSession | null>(null);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const startedAt = useRef(new Date());
  useEffect(() => {
    if (!ready || retestRequested && !retestTrack) return;
    const controller = new AbortController();
    apiClient.startSession({ mode: "placement", tracks: sessionTracks, limit: 15 }, controller.signal)
      .then((result) => setSession({ id: result.sessionId, queue: apiCardsToQueue(result.cards) }))
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "배치 문항을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [ready, retestRequested, retestTrack, retryKey, sessionTracks]);
  if (retestRequested && !retestTrack) return <Navigate replace to="/settings" />;
  if (settingsError) return <div className="session-empty"><h1>설정을 불러오지 못했습니다.</h1><p role="alert">{settingsError}</p><button onClick={retrySettings}>다시 시도</button><button onClick={() => navigate(returnTo, { replace: Boolean(retestTrack) })}>돌아가기</button></div>;
  if (error) return <div className="session-empty"><h1>배치 문항을 불러오지 못했습니다.</h1><p role="alert">{error}</p><button onClick={() => { setError(""); setRetryKey((value) => value + 1); }}>다시 시도</button><button onClick={() => navigate(returnTo, { replace: Boolean(retestTrack) })}>돌아가기</button></div>;
  if (!ready || !session) return <p>배치 문항을 불러오는 중…</p>;
  return (
    <SessionRunner
      characters={queueCharacters(session.queue)}
      enabledTracks={sessionTracks}
      mode="placement"
      onyomiScript={onyomiScript}
      onComplete={async (result) => {
        const endedAt = new Date().toISOString();
        try {
          const placement = await apiClient.scorePlacement(result.answers ?? []);
          enqueuePendingSummary(profileId, { sessionId: session.id, mode: "placement", startedAt: startedAt.current.toISOString(), endedAt, answered: result.answered, correct: result.correct, skipped: result.skipped, bestCombo: result.bestCombo, xp: result.xp });
          navigate("/placement-result", { replace: true, state: { ...placement, returnTo: retestTrack ? "/settings" : "/home" } });
        } catch {
          setError("배치 결과를 저장하지 못했습니다. 다시 시도해 주세요.");
        }
      }}
      onQuit={() => navigate(returnTo, { replace: Boolean(retestTrack) })}
      queueOverride={session.queue}
      sessionId={session.id}
      soundMode={soundMode}
    />
  );
}
