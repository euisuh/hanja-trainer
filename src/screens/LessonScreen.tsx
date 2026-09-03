import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
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
  const lessonState = location.state as { mode?: "level-review"; track?: Track; tracks?: Track[]; unitId?: number; levelOrd?: number; testOut?: boolean } | null;
  const requestedTracks = lessonState?.tracks ?? lessonState?.track;
  const tracks = useMemo(() => lessonTracks(requestedTracks, enabledTracks), [enabledTracks, requestedTracks]);
  const mode = lessonState?.mode === "level-review" ? "level-review" : "lesson";
  const testOut = lessonState?.testOut === true;
  const validUnit = Number.isInteger(lessonState?.unitId) && lessonState!.unitId! > 0;
  const validLevelReview = mode !== "level-review" || Number.isInteger(lessonState?.levelOrd) && lessonState!.levelOrd! > 0 && tracks.length === 1 && Array.isArray(lessonState?.tracks) && lessonState.tracks.length === 1 && lessonState.tracks[0] === tracks[0];
  const validTestOut = testOut && mode === "lesson" && validUnit && tracks.length === 1 && Array.isArray(lessonState?.tracks) && lessonState.tracks.length === 1 && lessonState.tracks[0] === tracks[0];
  const unitId = validUnit ? lessonState?.unitId : undefined;
  const levelOrd = mode === "level-review" && validLevelReview ? lessonState?.levelOrd : undefined;
  useEffect(() => {
    if (!ready || testOut && !validTestOut || !validLevelReview) return;
    const controller = new AbortController();
    apiClient.startSession({ mode, tracks, limit: 8, ...(mode === "level-review" ? { levelOrd } : { unitId }), ...(testOut ? { testOut: true } : {}) }, controller.signal)
      .then((result) => setSession({ id: result.sessionId, queue: apiCardsToQueue(result.cards) }))
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "레슨을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [levelOrd, mode, ready, retryKey, testOut, tracks, unitId, validLevelReview, validTestOut]);
  if (testOut && !validTestOut || !validLevelReview) return <Navigate replace to="/home" />;
  if (settingsError) return <div className="session-empty"><h1>설정을 불러오지 못했습니다.</h1><p role="alert">{settingsError}</p><button onClick={retrySettings}>다시 시도</button><button onClick={() => navigate("/home")}>지도로 돌아가기</button></div>;
  if (error) return <div className="session-empty"><h1>{testOut ? "유닛 테스트를 완료하지 못했습니다." : "레슨을 불러오지 못했습니다."}</h1><p role="alert">{error}</p><button onClick={() => { startedAt.current = new Date(); setError(""); setRetryKey((value) => value + 1); }}>다시 시도</button><button onClick={() => navigate("/home")}>지도로 돌아가기</button></div>;
  if (!ready || !session) return <p>{testOut ? "유닛 테스트" : "레슨"}을 불러오는 중…</p>;
  return (
    <SessionRunner
      characters={queueCharacters(session.queue)}
      enabledTracks={tracks}
      mode={testOut ? "unit-test" : mode}
      onyomiScript={onyomiScript}
      onComplete={async (result) => {
        if (testOut && unitId) {
          try {
            const unitTest = await apiClient.completeUnitTest(unitId, session.id, result.unitTestAnswers ?? []);
            let profile;
            if (unitTest.passed) {
              try {
                profile = await apiClient.createSession({ mode: "lesson", startedAt: startedAt.current.toISOString(), endedAt: new Date().toISOString(), answered: result.answered, correct: result.correct, skipped: result.skipped, bestCombo: result.bestCombo, xp: result.xp });
              } catch { /* Unit completion is already safely persisted. */ }
            }
            navigate("/session-complete", { state: { ...result, profile, unitTest } });
          } catch {
            setSession(null);
            setError("유닛 테스트 결과를 저장하지 못했습니다. 다시 시도해 주세요.");
          }
          return;
        }
        try {
          const profile = await apiClient.createSession({ mode, startedAt: startedAt.current.toISOString(), endedAt: new Date().toISOString(), answered: result.answered, correct: result.correct, skipped: result.skipped, bestCombo: result.bestCombo, xp: result.xp });
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
