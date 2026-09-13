import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSettings } from "../features/settings/useSettings";
import { useActiveProfile } from "../features/profile/ProfileContext";
import { homePrimaryAction, trackImbalance, type PathNodeModel, type TrackSnoozes } from "../features/path-map/homeModel";
import { PathMap } from "../features/path-map/PathMap";
import { TrackTabs } from "../features/tracks/TrackTabs";
import { trackThemes } from "../features/tracks/trackTheme";
import { TRACKS, type Track } from "../../shared/types";
import type { CurriculumResponse, StatsResponse } from "../../shared/api";
import { apiClient } from "../lib/apiClient";
import "../features/path-map/pathMap.css";

const NUDGE_SNOOZES_KEY = "hanja-trainer:track-imbalance-snoozes";
const ACTIVE_TRACK_KEY = "hanja-trainer:active-track";
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
  const activeTrackKey = `${ACTIVE_TRACK_KEY}:${profileId}`;
  const { enabledTracks, onyomiScript, error: settingsError, ready, retry: retrySettings } = useSettings();
  const [track, setTrack] = useState<Track>(() => {
    try {
      const stored = localStorage.getItem(activeTrackKey);
      return TRACKS.find((candidate) => candidate === stored) ?? enabledTracks[0] ?? "kr";
    } catch {
      return enabledTracks[0] ?? "kr";
    }
  });
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [curriculum, setCurriculum] = useState<CurriculumResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const [snoozes, setSnoozes] = useState<TrackSnoozes>(() => readSnoozes(snoozesKey));
  const [now] = useState(Date.now);
  const [loadedKey, setLoadedKey] = useState("");
  const [loadError, setLoadError] = useState<{ key: string; message: string } | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const statsRequest = useRef<Promise<StatsResponse | null> | null>(null);
  const selectedTrack = enabledTracks.includes(track) ? track : enabledTracks[0] ?? "kr";
  const requestKey = `${selectedTrack}:${enabledTracks.join(",")}:${retryKey}`;
  const loaded = loadedKey === requestKey;
  const error = loadError?.key === requestKey ? loadError.message : "";
  const theme = trackThemes[selectedTrack];
  const unit = loaded ? curriculum?.units.find((item) => item.current) ?? curriculum?.units[0] : undefined;
  const nodes: PathNodeModel[] = useMemo(() => unit?.nodes.map((node) => ({ characterKey: node.key, glyph: node.glyph, label: node.state === "locked" ? "잠김" : node.reading, state: node.state })) ?? [], [unit]);
  const progress = stats?.tracks.find((item) => item.track === selectedTrack);
  const scalePercent = progress?.pct ?? 0;
  const laggingTrack = !settingsError && stats ? trackImbalance(stats.tracks, snoozes, now) : undefined;
  const primaryAction = ready && !settingsError && !error && unit ? homePrimaryAction(dueCount, unit.id, selectedTrack) : undefined;

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
      if (controller.signal.aborted) return;
      setCurriculum(content);
      setDueCount(review.total);
      setStats(homeStats);
      setLoadedKey(requestKey);
      setLoadError(null);
      setFocusedIndex(0);
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setLoadError({ key: requestKey, message: caught instanceof Error ? caught.message : "학습 지도를 불러오지 못했습니다." });
    });
    return () => controller.abort();
  }, [enabledTracks, ready, requestKey, selectedTrack]);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(activeTrackKey, selectedTrack); } catch { /* Navigation still carries the active track when storage is unavailable. */ }
  }, [activeTrackKey, ready, selectedTrack]);

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
        if (primaryAction) navigate(primaryAction.path, { state: primaryAction.state });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabledTracks, focusedIndex, laggingTrack, navigate, nodes, primaryAction, selectedTrack, startLaggingLesson]);

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
      {error && <div><p role="alert">학습 지도를 불러오지 못했습니다. {error}</p><button onClick={() => { setLoadError(null); setRetryKey((value) => value + 1); }} type="button">다시 시도</button></div>}
      {!error && !loaded && <p>학습 지도를 불러오는 중…</p>}
      {!error && loaded && curriculum && !unit && <div><p>이 트랙에는 아직 학습 콘텐츠가 없습니다.</p><button onClick={() => setRetryKey((value) => value + 1)} type="button">다시 확인</button></div>}
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
          <button className="lesson-cta" onClick={() => primaryAction && navigate(primaryAction.path, { state: primaryAction.state })} type="button">
            <small>오늘의 학습</small><strong>{dueCount > 0 ? "만기 복습 시작" : "레슨 시작"}</strong><span>{dueCount > 0 ? `만기 전체 ${dueCount}장 · 한자 문제 최대 20개 · 단어 문제 추가 가능` : "현재 유닛 새 글자 학습"} <kbd>ENTER</kbd></span>
          </button>
          {dueCount > 0 && <button className="home-shelf__item" onClick={() => navigate("/lesson", { state: { unitId: unit.id, tracks: [selectedTrack] } })} type="button"><small>새 학습</small><strong>레슨 시작</strong><span>복습 뒤에 권장</span></button>}
          <p className="home-routine">복습에서는 먼저 소리 내거나 종이에 답을 떠올리고, 정답과 비교해 <strong>기억하지 못함</strong> 또는 <strong>정확히 기억함</strong>을 솔직히 표시하세요. 다음 복습일에 다시 회상합니다. <Link to="/about#learning-method">학습 방법과 근거</Link></p>
          <div className="home-shelf">
            <button className="home-shelf__item" onClick={() => navigate(`/study/${unit.id}`)} type="button">
              <span aria-hidden="true" className="home-shelf__glyph">目</span><strong>학습 목록</strong>
            </button>
            {selectedTrack !== "kr" && <button aria-label="말하기 연습" className="home-shelf__item" onClick={() => navigate(`/speaking/${unit.id}`)} type="button">
              <span aria-hidden="true" className="home-shelf__glyph">音</span><strong>말하기</strong>
            </button>}
            {unit.nodes.some((node) => node.state !== "done") && <button aria-label="이 유닛 건너뛰기" className="home-shelf__item" onClick={() => navigate("/lesson", { state: { unitId: unit.id, tracks: [selectedTrack], testOut: true } })} type="button">
              <span aria-hidden="true" className="home-shelf__glyph">跳</span><strong>건너뛰기</strong>
            </button>}
          </div>
          <button className="review-cta" onClick={() => navigate("/review", { state: { track: selectedTrack } })} type="button">
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
