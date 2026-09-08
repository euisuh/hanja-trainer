import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { reviewableLevels, reviewableUnits, reviewLevelOptions } from "../features/path-map/homeModel";
import { useActiveProfile } from "../features/profile/ProfileContext";
import { useSettings } from "../features/settings/useSettings";
import "../features/review/review.css";
import { SessionRunner } from "../features/session/SessionRunner";
import { apiCardsToQueue, queueCharacters } from "../features/session/apiQueue";
import type { SessionQueueItem } from "../shared/buildQueue";
import { trackThemes } from "../features/tracks/trackTheme";
import { apiClient } from "../lib/apiClient";
import type { CurriculumResponse, DueReviewsResponse } from "../shared/api";
import { toHiragana } from "../shared/kana";
import type { Track } from "../shared/types";

type LoadedSession = { id: string; queue: SessionQueueItem[] };
type LoadState<T> = { key: string; value?: T; error?: string };

export const REVIEW_SESSION_LENGTH = 20;
const WHOLE_LEVEL_REVIEW_LIMIT = 20;
const ACTIVE_TRACK_KEY = "hanja-trainer:active-track";

export function ReviewScreen() {
  const { key } = useLocation();
  return <ReviewScreenContent key={key} />;
}

function ReviewScreenContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { id: profileId } = useActiveProfile();
  const { enabledTracks, onyomiScript, soundMode, error: settingsError, ready, retry: retrySettings } = useSettings();
  const [sessionLoad, setSessionLoad] = useState<LoadState<LoadedSession> | null>(null);
  const [dueLoad, setDueLoad] = useState<LoadState<DueReviewsResponse> | null>(null);
  const [curriculumLoad, setCurriculumLoad] = useState<LoadState<CurriculumResponse> | null>(null);
  const [chosenReviewLevelOrd, setChosenReviewLevelOrd] = useState<number | null>(null);
  const [chosenReviewUnitId, setChosenReviewUnitId] = useState<number | null>(null);
  const [reviewWholeLevel, setReviewWholeLevel] = useState(false);
  const [sessionRetryKey, setSessionRetryKey] = useState(0);
  const [dueRetryKey, setDueRetryKey] = useState(0);
  const [curriculumRetryKey, setCurriculumRetryKey] = useState(0);
  const inSession = location.pathname === "/review/session";
  const requestedTrack = (location.state as { track?: Track } | null)?.track;
  let rememberedTrack: Track | undefined;
  try {
    const stored = localStorage.getItem(`${ACTIVE_TRACK_KEY}:${profileId}`);
    rememberedTrack = enabledTracks.find((candidate) => candidate === stored);
  } catch { /* Fall back to route state and enabled tracks when storage is unavailable. */ }
  const selectedTrack = requestedTrack && enabledTracks.includes(requestedTrack) ? requestedTrack : rememberedTrack ?? enabledTracks[0] ?? "kr";
  const enabledTrackKey = enabledTracks.join(",");
  const sessionLoadKey = `${location.key}:${enabledTrackKey}:${sessionRetryKey}`;
  const dueLoadKey = `${location.key}:${enabledTrackKey}:${dueRetryKey}`;
  const curriculumLoadKey = `${location.key}:${selectedTrack}:${curriculumRetryKey}`;
  const sessionState = sessionLoad?.key === sessionLoadKey ? sessionLoad : null;
  const dueState = dueLoad?.key === dueLoadKey ? dueLoad : null;
  const curriculumState = curriculumLoad?.key === curriculumLoadKey ? curriculumLoad : null;
  const session = sessionState?.value ?? null;
  const due = dueState?.value ?? null;
  const curriculum = curriculumState?.value ?? null;
  const theme = trackThemes[selectedTrack];
  const previousUnits = useMemo(() => reviewableUnits(curriculum?.units ?? []), [curriculum]);
  const reviewLevels = useMemo(() => {
    const levelOrds = new Set(previousUnits.map((item) => item.levelOrd));
    return reviewLevelOptions(curriculum?.units ?? []).filter((item) => levelOrds.has(item.levelOrd));
  }, [curriculum, previousUnits]);
  const fullyReviewableLevelOrds = useMemo(() => new Set(reviewableLevels(curriculum?.units ?? []).map((item) => item.levelOrd)), [curriculum]);
  const reviewLevelOrd = reviewLevels.some((item) => item.levelOrd === chosenReviewLevelOrd) ? chosenReviewLevelOrd : previousUnits.at(-1)?.levelOrd ?? null;
  const reviewUnits = previousUnits.filter((item) => item.levelOrd === reviewLevelOrd);
  const reviewUnit = reviewUnits.find((item) => item.id === chosenReviewUnitId) ?? reviewUnits.at(-1);
  const wholeLevelReview = reviewWholeLevel && reviewLevelOrd !== null && fullyReviewableLevelOrds.has(reviewLevelOrd);
  const startedAt = useRef(new Date());
  const dueRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(`${ACTIVE_TRACK_KEY}:${profileId}`, selectedTrack); } catch { /* Route state still preserves the active track for in-flow navigation. */ }
  }, [profileId, ready, selectedTrack]);

  useEffect(() => {
    if (!ready || !inSession) return;
    const controller = new AbortController();
    startedAt.current = new Date();
    apiClient.startSession({ mode: "review", tracks: enabledTracks, limit: REVIEW_SESSION_LENGTH }, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setSessionLoad({ key: sessionLoadKey, value: { id: result.sessionId, queue: apiCardsToQueue(result.cards) } }); })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setSessionLoad({ key: sessionLoadKey, error: caught instanceof Error ? caught.message : "복습 세션을 불러오지 못했습니다." }); });
    return () => controller.abort();
  }, [enabledTracks, inSession, ready, sessionLoadKey]);

  useEffect(() => {
    if (!ready || inSession) return;
    const controller = new AbortController();
    apiClient.dueReviews(enabledTracks, REVIEW_SESSION_LENGTH, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setDueLoad({ key: dueLoadKey, value }); })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setDueLoad({ key: dueLoadKey, error: caught instanceof Error ? caught.message : "복습 큐를 불러오지 못했습니다." }); });
    return () => controller.abort();
  }, [dueLoadKey, enabledTracks, inSession, ready]);

  useEffect(() => {
    if (!ready || inSession) return;
    const controller = new AbortController();
    apiClient.curriculum(selectedTrack, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setCurriculumLoad({ key: curriculumLoadKey, value }); })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setCurriculumLoad({ key: curriculumLoadKey, error: caught instanceof Error ? caught.message : "이전 레벨 복습을 불러오지 못했습니다." }); });
    return () => controller.abort();
  }, [curriculumLoadKey, inSession, ready, selectedTrack]);

  useEffect(() => {
    if (inSession || !due || due.total === 0) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter") return;
      if (event.target instanceof HTMLElement && event.target.matches("button, a, select")) return;
      event.preventDefault();
      navigate("/review/session", { state: { track: selectedTrack } });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [due, inSession, navigate, selectedTrack]);

  if (settingsError) return <section className="review-screen"><h1>복습 큐</h1><p role="alert">설정을 불러오지 못했습니다. {settingsError}</p><button onClick={retrySettings} type="button">다시 시도</button></section>;

  if (inSession) {
    if (sessionState?.error) return <section className="review-screen"><h1>복습 세션</h1><p role="alert">{sessionState.error}</p><button onClick={() => setSessionRetryKey((value) => value + 1)} type="button">다시 시도</button><button onClick={() => navigate("/review", { state: { track: selectedTrack } })} type="button">복습 큐로 돌아가기</button></section>;
    if (!ready || !session) return <p>복습 세션을 불러오는 중…</p>;
    return (
      <SessionRunner
        characters={queueCharacters(session.queue)}
        enabledTracks={enabledTracks}
        mode="review"
        onyomiScript={onyomiScript}
        onComplete={async (result) => {
          try {
            const profile = await apiClient.createSession({ mode: "review", startedAt: startedAt.current.toISOString(), endedAt: new Date().toISOString(), answered: result.answered, correct: result.correct, skipped: result.skipped, bestCombo: result.bestCombo, xp: result.xp });
            navigate("/session-complete", { state: { ...result, profile } });
          } catch {
            navigate("/session-complete", { state: result });
          }
        }}
        onQuit={() => navigate("/review", { state: { track: selectedTrack } })}
        queueOverride={session.queue}
        sessionId={session.id}
        soundMode={soundMode}
      />
    );
  }

  if (!ready) return <p>복습 큐를 불러오는 중…</p>;

  return (
    <section className="review-screen" style={{ "--home-accent": theme.accent, "--home-accent-text": theme.accentText, "--home-soft": theme.soft } as CSSProperties}>
      <h1>복습 큐</h1>
      <p>FSRS 만기 카드만 뽑습니다. 신규 학습과 분리된 세션입니다.</p>
      {dueState?.error ? <div className="review-empty"><p role="alert">{dueState.error}</p><button onClick={() => setDueRetryKey((value) => value + 1)} type="button">복습 큐 다시 시도</button></div> : !due ? <p>복습 큐를 불러오는 중…</p> : due.total === 0 ? (
        <div className="review-empty">
          <span aria-hidden="true" className="review-empty__glyph">完</span>
          <strong>오늘 복습할 카드가 없습니다</strong>
          <Link to="/lesson">새 레슨 시작하기</Link>
        </div>
      ) : (
        <>
          <button className="review-start" onClick={() => navigate("/review/session", { state: { track: selectedTrack } })} type="button">{due.total}장 복습 시작 <kbd>ENTER</kbd></button>
          <div className="due-list">{due.cards.map((item, index) => <button className="due-row" key={`${item.characterKey}:${item.track}`} onClick={() => navigate(`/detail/${encodeURIComponent(item.characterKey)}`, { state: { from: "/review" } })} onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            const direction = event.key === "ArrowDown" ? 1 : -1;
            dueRefs.current[(index + direction + due.cards.length) % due.cards.length]?.focus();
          }} ref={(node) => { dueRefs.current[index] = node; }} type="button"><span className={`due-row__glyph due-row__glyph--${item.track}`} lang={trackThemes[item.track].lang}>{item.glyph}</span><span className="due-row__copy"><strong lang={trackThemes[item.track].lang}>{item.characterKey}</strong><small lang={trackThemes[item.track].lang}>{item.track === "jp" && onyomiScript === "hiragana" ? toHiragana(item.reading) : item.reading}</small></span><span className={`due-row__when${item.overdueDays > 0 ? " due-row__when--overdue" : ""}`}>{item.overdueDays > 0 ? `${item.overdueDays}일 지남` : "오늘 만기"}</span></button>)}</div>
        </>
      )}
      {curriculumState?.error ? <section className="level-review-picker"><label>이전 레벨 복습</label><p role="alert">{curriculumState.error}</p><button onClick={() => setCurriculumRetryKey((value) => value + 1)} type="button">이전 레벨 다시 시도</button></section> : previousUnits.length > 0 && <section className="level-review-picker">
        <label htmlFor="level-review-level">이전 레벨 복습</label>
        <div className="level-review-picker__controls">
          <select id="level-review-level" onChange={(event) => { setChosenReviewLevelOrd(Number(event.target.value)); setChosenReviewUnitId(null); setReviewWholeLevel(false); }} value={reviewLevelOrd ?? ""}>
            {reviewLevels.map(({ label, levelOrd }) => <option key={levelOrd} value={levelOrd}>{label}</option>)}
          </select>
          <select aria-label="복습 범위" onChange={(event) => { setReviewWholeLevel(event.target.value === "level"); if (event.target.value !== "level") setChosenReviewUnitId(Number(event.target.value)); }} value={wholeLevelReview ? "level" : reviewUnit?.id ?? ""}>
            {reviewLevelOrd !== null && fullyReviewableLevelOrds.has(reviewLevelOrd) && <option value="level">레벨 전체 · {WHOLE_LEVEL_REVIEW_LIMIT}자</option>}
            {reviewUnits.map((item) => <option key={item.id} value={item.id}>UNIT {item.ord} · {item.progress.total}자</option>)}
          </select>
          <button disabled={!wholeLevelReview && !reviewUnit} onClick={() => navigate("/lesson", { state: { mode: "level-review", tracks: [selectedTrack], ...(wholeLevelReview ? { levelOrd: reviewLevelOrd, limit: WHOLE_LEVEL_REVIEW_LIMIT } : { unitId: reviewUnit?.id, limit: reviewUnit?.progress.total }) } })} type="button">복습하기</button>
        </div>
        <small>완료한 레벨 전체 또는 유닛별로 다시 연습할 수 있어요.</small>
      </section>}
    </section>
  );
}
