import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { loadOnboardingProfile } from "../features/onboarding/tracks";
import { buildPathNodes, progressPercent } from "../features/path-map/homeModel";
import { PathMap } from "../features/path-map/PathMap";
import { buildDueItems } from "../features/review/DueList";
import { demoCharacters, loadDemoStates } from "../features/session/demoData";
import { TrackTabs } from "../features/tracks/TrackTabs";
import { trackThemes } from "../features/tracks/trackTheme";
import type { Track } from "../shared/types";
import "../features/path-map/pathMap.css";

export function HomeScreen() {
  const navigate = useNavigate();
  const enabledTracks = useMemo(() => loadOnboardingProfile().enabledTracks, []);
  const states = useMemo(() => loadDemoStates(), []);
  const [track, setTrack] = useState<Track>(enabledTracks[0] ?? "kr");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const theme = trackThemes[track];
  const nodes = buildPathNodes(demoCharacters, track, states);
  const dueCount = buildDueItems(demoCharacters, states, enabledTracks).length;
  const masteredCount = nodes.filter((node) => node.state === "done").length;
  const scalePercent = progressPercent(masteredCount, theme.scaleTotal);

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
        if (!node || node.state === "locked") return;
        event.preventDefault();
        navigate(`/detail/${encodeURIComponent(node.character.key)}`);
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
      <TrackTabs active={track} enabled={enabledTracks} onChange={setTrack} />
      <div className="home-layout">
        <PathMap
          focusedIndex={focusedIndex}
          nodes={nodes}
          onFocus={setFocusedIndex}
          onOpen={(node) => navigate(`/detail/${encodeURIComponent(node.character.key)}`)}
          title={theme.title}
          unit={theme.unit}
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
    </section>
  );
}
