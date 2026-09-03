import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useSettings } from "../features/settings/useSettings";
import { useActiveProfile } from "../features/profile/ProfileContext";
import { trackImbalance, type PathNodeModel, type TrackSnoozes } from "../features/path-map/homeModel";
import { PathMap } from "../features/path-map/PathMap";
import { TrackTabs } from "../features/tracks/TrackTabs";
import { trackThemes } from "../features/tracks/trackTheme";
import { TRACKS, type Track } from "../shared/types";
import type { CurriculumResponse, StatsResponse } from "../shared/api";
import { apiClient } from "../lib/apiClient";
import "../features/path-map/pathMap.css";

const NUDGE_SNOOZES_KEY = "hanja-trainer:track-imbalance-snoozes";
const DAY_MS = 86_400_000;

function readSnoozes(storageKey: string): TrackSnoozes {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(TRACKS.flatMap((track) => typeof (parsed as Record<string, unknown>)[track] === "number" ? [[track, (parsed as Record<string, number>)[track]]] : []));
  } catch {
    return {};
  }
}

export function HomeScreen() {
  const navigate = useNavigate();
  const { id: profileId } = useActiveProfile();
  const snoozesKey = `${NUDGE_SNOOZES_KEY}:${profileId}`;
  const { enabledTracks, onyomiScript, error: settingsError, ready, retry: retrySettings } = useSettings();
  const [track, setTrack] = useState<Track>(enabledTracks[0] ?? "kr");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [curriculum, setCurriculum] = useState<CurriculumResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const [chosenReviewLevelOrd, setChosenReviewLevelOrd] = useState<number | null>(null);
  const [snoozes, setSnoozes] = useState<TrackSnoozes>(() => readSnoozes(snoozesKey));
  const [now] = useState(Date.now);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const statsRequest = useRef<Promise<StatsResponse | null> | null>(null);
  const selectedTrack = enabledTracks.includes(track) ? track : enabledTracks[0] ?? "kr";
  const theme = trackThemes[selectedTrack];
  const unit = curriculum?.units.find((item) => item.current) ?? curriculum?.units[0];
  const completedLevels = useMemo(() => {
    const units = curriculum?.units ?? [];
    const incomplete = new Set(units.filter((item) => item.nodes.some((node) => node.state !== "done")).map((item) => item.levelOrd));
    return [...new Map(units.filter((item) => !incomplete.has(item.levelOrd)).map((item) => [item.levelOrd, item] as const)).values()];
  }, [curriculum]);
  const reviewLevelOrd = completedLevels.some((item) => item.levelOrd === chosenReviewLevelOrd) ? chosenReviewLevelOrd : completedLevels.at(-1)?.levelOrd ?? null;
  const nodes: PathNodeModel[] = useMemo(() => unit?.nodes.map((node) => ({ characterKey: node.key, glyph: node.glyph, label: node.state === "locked" ? "잠김" : node.reading, state: node.state })) ?? [], [unit]);
  const progress = stats?.tracks.find((item) => item.track === selectedTrack);
  const scalePercent = progress?.pct ?? 0;
  const laggingTrack = !settingsError && stats ? trackImbalance(stats.tracks, snoozes, now) : undefined;

  const snooze = useCallback((track: Track, days: number) => {
    setSnoozes((current) => {
      const next = { ...current, [track]: Date.now() + days * DAY_MS };
      try { localStorage.setItem(snoozesKey, JSON.stringify(next)); } catch { /* Session state still hides the nudge. */ }
      return next;
    });
  }, [snoozesKey]);

  const startLaggingLesson = useCallback(() => {
    if (!laggingTrack) return;
    snooze(laggingTrack, 14);
    navigate("/lesson", { state: { tracks: [laggingTrack] } });
  }, [laggingTrack, navigate, snooze]);

  useEffect(() => {
    if (!laggingTrack) return;
    const next = { ...readSnoozes(snoozesKey), [laggingTrack]: Date.now() + 7 * DAY_MS };
    try { localStorage.setItem(snoozesKey, JSON.stringify(next)); } catch { /* Cooldown can fail without blocking the nudge. */ }
  }, [laggingTrack, snoozesKey]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    statsRequest.current ??= apiClient.stats().catch(() => null);
    Promise.all([
      apiClient.curriculum(selectedTrack, controller.signal),
      apiClient.dueReviews(enabledTracks, 50, controller.signal),
      statsRequest.current,
    ]).then(([content, review, homeStats]) => {
      setCurriculum(content);
      setDueCount(review.total);
      setStats(homeStats);
      setError("");
      setFocusedIndex(0);
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "학습 지도를 불러오지 못했습니다.");
    });
    return () => controller.abort();
  }, [enabledTracks, ready, retryKey, selectedTrack]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable)) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setFocusedIndex((current) => Math.max(0, Math.min(nodes.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))));
      } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        setTrack((current) => {
          const index = enabledTracks.indexOf(current);
          const direction = event.key === "ArrowRight" ? 1 : -1;
          return enabledTracks[(index + direction + enabledTracks.length) % enabledTracks.length] ?? current;
        });
      } else if (event.key.toLowerCase() === "d") {
        const node = nodes[focusedIndex];
        if (!node) return;
        event.preventDefault();
        navigate(`/detail/${encodeURIComponent(node.characterKey)}`, { state: { from: "/home" } });
      } else if (event.key.toLowerCase() === "l" && laggingTrack && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        startLaggingLesson();
      } else if (event.key === "Enter" && !(target instanceof HTMLElement && target.matches("button, a"))) {
        event.preventDefault();
        if (unit) navigate("/lesson", { state: { unitId: unit.id, tracks: [selectedTrack] } });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabledTracks, focusedIndex, laggingTrack, navigate, nodes, selectedTrack, startLaggingLesson, unit]);

  return (
    <section className="home-screen" style={{ "--home-accent": theme.accent, "--home-accent-text": theme.accentText, "--home-soft": theme.soft, "--home-font": theme.font } as CSSProperties}>
      <TrackTabs active={selectedTrack} enabled={enabledTracks} onChange={setTrack} />
      {laggingTrack && (
        <aside className="track-imbalance" style={{ "--nudge-accent": trackThemes[laggingTrack].accent, "--nudge-soft": trackThemes[laggingTrack].soft } as CSSProperties}>
          <p><strong>{trackThemes[laggingTrack].label} 트랙이 한동안 조용해요.</strong> 오늘 짧게 시작해 볼까요?</p>
          <div className="track-imbalance__actions">
            <button className="track-imbalance__start" onClick={startLaggingLesson} type="button">이 트랙 학습 <kbd>L</kbd></button>
            <button className="track-imbalance__dismiss" onClick={() => snooze(laggingTrack, 7)} type="button">이번 주 숨기기</button>
          </div>
        </aside>
      )}
      {settingsError && <div><p role="alert">설정을 불러오지 못했습니다. {settingsError}</p><button onClick={retrySettings} type="button">다시 시도</button></div>}
      {error && <div><p role="alert">학습 지도를 불러오지 못했습니다. {error}</p><button onClick={() => { setCurriculum(null); setError(""); setRetryKey((value) => value + 1); }} type="button">다시 시도</button></div>}
      {!error && !curriculum && <p>학습 지도를 불러오는 중…</p>}
      {!error && curriculum && !unit && <div><p>이 트랙에는 아직 학습 콘텐츠가 없습니다.</p><button onClick={() => setRetryKey((value) => value + 1)} type="button">다시 확인</button></div>}
      {!settingsError && !error && unit && (
      <div className="home-layout">
        <PathMap
          focusedIndex={focusedIndex}
          nodes={nodes}
          onyomiScript={onyomiScript}
          onFocus={setFocusedIndex}
          onOpen={(node) => navigate(`/detail/${encodeURIComponent(node.characterKey)}`, { state: { from: "/home" } })}
          title={unit.title}
          track={selectedTrack}
          unit={`${unit.level} · UNIT ${unit.ord}`}
        />
        <aside className="home-rail">
          <button className="lesson-cta" onClick={() => navigate("/lesson", { state: { unitId: unit.id, tracks: [selectedTrack] } })} type="button">
            <small>오늘의 학습</small><strong>레슨 시작</strong><span>신규 4자 + 복습 {dueCount}장 <kbd>ENTER</kbd></span>
          </button>
          <button className="study-cta" onClick={() => navigate(`/study/${unit.id}`)} type="button">
            <small>퀴즈 전 미리보기</small><strong>학습 목록</strong><span>읽기 · 뜻 · 예문 · 발음</span>
          </button>
          {selectedTrack !== "kr" && <button className="speaking-cta" onClick={() => navigate(`/speaking/${unit.id}`)} type="button">
            <small>저장·채점 없는 연습</small><strong>말하기 연습</strong><span>참고 음성 · 녹음 · 다시 듣기</span>
          </button>}
          {unit.nodes.some((node) => node.state !== "done") && <button className="unit-test-cta" onClick={() => navigate("/lesson", { state: { unitId: unit.id, tracks: [selectedTrack], testOut: true } })} type="button">
            <small>실력으로 잠금 해제</small><strong>이 유닛 건너뛰기</strong><span>전 글자 2회 · 전부 정답</span>
          </button>}
          {completedLevels.length > 0 && <section className="level-review-picker">
            <label htmlFor="level-review-select">완료한 레벨 복습</label>
            <div className="level-review-picker__controls">
              <select id="level-review-select" onChange={(event) => setChosenReviewLevelOrd(Number(event.target.value))} value={reviewLevelOrd ?? ""}>
                {completedLevels.map((item) => <option key={item.levelOrd} value={item.levelOrd}>{item.level}</option>)}
              </select>
              <button disabled={reviewLevelOrd === null} onClick={() => navigate("/lesson", { state: { mode: "level-review", tracks: [selectedTrack], levelOrd: reviewLevelOrd } })} type="button">복습하기</button>
            </div>
            <small>만기 여부와 관계없이 선택한 레벨을 연습합니다.</small>
          </section>}
          <button className="review-cta" onClick={() => navigate("/review")} type="button">
            <small>FSRS 복습 큐</small><strong>{dueCount}장 만기</strong><span>가장 급한 카드부터 <kbd>R</kbd></span>
          </button>
          <section className="exam-progress">
            <small>시험 기준 진도</small>
            <strong>{progress?.known ?? 0}/{progress?.total ?? 0}자</strong>
            <div aria-label={`시험 기준 진도 ${Math.round(scalePercent)}%`} className="exam-progress__bar" role="progressbar" aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round(scalePercent)}><span style={{ width: `${scalePercent}%` }} /></div>
            <p>{progress?.currentLevel ?? "시작 전"}{progress?.nextLevel ? ` → ${progress.nextLevel}` : ""}</p>
            {progress?.secondaryScale && <p>{progress.secondaryScale.name} {progress.secondaryScale.level} · {progress.secondaryScale.known}/{progress.secondaryScale.total}{progress.secondaryScale.nextLevel ? ` → ${progress.secondaryScale.nextLevel}` : ""}</p>}
          </section>
        </aside>
      </div>
      )}
    </section>
  );
}
