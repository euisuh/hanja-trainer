import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSettings } from "../features/settings/useSettings";
import { SessionRunner } from "../features/session/SessionRunner";
import { apiCardsToQueue, queueCharacters } from "../features/session/apiQueue";
import { apiClient } from "../lib/apiClient";
import type { SessionQueueItem } from "../features/session/buildQueue";
import type { Track } from "../shared/types";

type LoadedSession = { id: string; queue: SessionQueueItem[] };

export function lessonTracks(requested: Track | readonly Track[] | undefined, enabledTracks: Track[]): Track[] {
  const tracks = Array.isArray(requested) ? [...new Set(requested)] : requested ? [requested] : [];
  return tracks.length > 0 && tracks.every((track) => enabledTracks.includes(track)) ? tracks : enabledTracks;
}

export function LessonScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const { enabledTracks, onyomiScript, error: settingsError, ready, retry: retrySettings } = useSettings();
  const [session, setSession] = useState<LoadedSession | null>(null);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const startedAt = useRef(new Date());
  const lessonState = location.state as { track?: Track; tracks?: Track[]; unitId?: number } | null;
  const requestedTracks = lessonState?.tracks ?? lessonState?.track;
  const tracks = useMemo(() => lessonTracks(requestedTracks, enabledTracks), [enabledTracks, requestedTracks]);
  const unitId = Array.isArray(lessonState?.tracks) && lessonState.tracks.length > 0 && lessonState.tracks.every((track) => enabledTracks.includes(track)) ? lessonState.unitId : undefined;
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    apiClient.startSession({ mode: "lesson", tracks, limit: 8, unitId }, controller.signal)
      .then((result) => setSession({ id: result.sessionId, queue: apiCardsToQueue(result.cards) }))
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "레슨을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [ready, retryKey, tracks, unitId]);
  if (settingsError) return <div className="session-empty"><h1>설정을 불러오지 못했습니다.</h1><p role="alert">{settingsError}</p><button onClick={retrySettings}>다시 시도</button><button onClick={() => navigate("/home")}>지도로 돌아가기</button></div>;
  if (error) return <div className="session-empty"><h1>레슨을 불러오지 못했습니다.</h1><p role="alert">{error}</p><button onClick={() => { setError(""); setRetryKey((value) => value + 1); }}>다시 시도</button><button onClick={() => navigate("/home")}>지도로 돌아가기</button></div>;
  if (!ready || !session) return <p>레슨을 불러오는 중…</p>;
  return (
    <SessionRunner
      characters={queueCharacters(session.queue)}
      enabledTracks={tracks}
      mode="lesson"
      onyomiScript={onyomiScript}
      onComplete={async (result) => {
        try {
          const profile = await apiClient.createSession({ mode: "lesson", startedAt: startedAt.current.toISOString(), endedAt: new Date().toISOString(), answered: result.answered, correct: result.correct, skipped: result.skipped, bestCombo: result.bestCombo, xp: result.xp });
          navigate("/session-complete", { state: { ...result, profile } });
        } catch {
          navigate("/session-complete", { state: result });
        }
      }}
      onQuit={() => navigate("/home")}
      queueOverride={session.queue}
      sessionId={session.id}
    />
  );
}
