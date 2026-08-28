import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useSettings } from "../features/settings/useSettings";
import { progressPercent, type PathNodeModel } from "../features/path-map/homeModel";
import { PathMap } from "../features/path-map/PathMap";
import { TrackTabs } from "../features/tracks/TrackTabs";
import { trackThemes } from "../features/tracks/trackTheme";
import type { Track } from "../shared/types";
import type { CurriculumResponse } from "../shared/api";
import { apiClient } from "../lib/apiClient";
import "../features/path-map/pathMap.css";

export function HomeScreen() {
  const navigate = useNavigate();
  const { enabledTracks, error: settingsError, ready, retry: retrySettings } = useSettings();
  const [track, setTrack] = useState<Track>(enabledTracks[0] ?? "kr");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [curriculum, setCurriculum] = useState<CurriculumResponse | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const selectedTrack = enabledTracks.includes(track) ? track : enabledTracks[0] ?? "kr";
  const theme = trackThemes[selectedTrack];
  const unit = curriculum?.units.find((item) => item.current) ?? curriculum?.units[0];
  const nodes: PathNodeModel[] = useMemo(() => unit?.nodes.map((node) => ({ characterKey: node.key, glyph: node.glyph, label: node.state === "locked" ? "잠김" : node.reading, state: node.state })) ?? [], [unit]);
  const masteredCount = curriculum?.units.reduce((sum, item) => sum + item.progress.known, 0) ?? 0;
  const scalePercent = progressPercent(masteredCount, theme.scaleTotal);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    Promise.all([
      apiClient.curriculum(selectedTrack, controller.signal),
      apiClient.dueReviews(enabledTracks, 50, controller.signal),
    ]).then(([content, review]) => {
      setCurriculum(content);
      setDueCount(review.total);
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
      } else if (event.key === "Enter" && !(target instanceof HTMLElement && target.matches("button, a"))) {
        event.preventDefault();
        navigate("/lesson");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabledTracks, focusedIndex, navigate, nodes]);

  return (
    <section className="home-screen" style={{ "--home-accent": theme.accent, "--home-soft": theme.soft, "--home-font": theme.font } as CSSProperties}>
      <TrackTabs active={selectedTrack} enabled={enabledTracks} onChange={setTrack} />
      {settingsError && <div><p role="alert">설정을 불러오지 못했습니다. {settingsError}</p><button onClick={retrySettings} type="button">다시 시도</button></div>}
      {error && <div><p role="alert">학습 지도를 불러오지 못했습니다. {error}</p><button onClick={() => { setCurriculum(null); setError(""); setRetryKey((value) => value + 1); }} type="button">다시 시도</button></div>}
      {!error && !curriculum && <p>학습 지도를 불러오는 중…</p>}
      {!error && curriculum && !unit && <div><p>이 트랙에는 아직 학습 콘텐츠가 없습니다.</p><button onClick={() => setRetryKey((value) => value + 1)} type="button">다시 확인</button></div>}
      {!settingsError && !error && unit && (
      <div className="home-layout">
        <PathMap
          focusedIndex={focusedIndex}
          nodes={nodes}
          onFocus={setFocusedIndex}
          onOpen={(node) => navigate(`/detail/${encodeURIComponent(node.characterKey)}`, { state: { from: "/home" } })}
          title={unit.title}
          unit={`${unit.level} · UNIT ${unit.ord}`}
        />
        <aside className="home-rail">
          <button className="lesson-cta" onClick={() => navigate("/lesson")} type="button">
            <small>오늘의 학습</small><strong>레슨 시작</strong><span>신규 4자 + 복습 {dueCount}장 <kbd>ENTER</kbd></span>
          </button>
          <button className="review-cta" onClick={() => navigate("/review")} type="button">
            <small>FSRS 복습 큐</small><strong>{dueCount}장 만기</strong><span>가장 급한 카드부터 <kbd>R</kbd></span>
          </button>
          <section className="exam-progress">
            <small>시험 기준 진도</small>
            <strong>{masteredCount}/{theme.scaleTotal}자 · {theme.scaleGoal}</strong>
            <div aria-label={`시험 기준 진도 ${Math.round(scalePercent)}%`} className="exam-progress__bar" role="progressbar" aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round(scalePercent)}><span style={{ width: `${scalePercent}%` }} /></div>
            <p>{theme.scaleNote}</p>
          </section>
        </aside>
      </div>
      )}
    </section>
  );
}
