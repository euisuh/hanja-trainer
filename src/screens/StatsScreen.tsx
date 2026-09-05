import { useEffect, useRef, useState } from "react";
import { StreakCalendar } from "../features/stats/StreakCalendar";
import { TrackMasteryCard } from "../features/stats/TrackMasteryCard";
import "../features/stats/stats.css";
import { apiClient } from "../lib/apiClient";
import type { StatsResponse } from "../shared/api";

export function isStreakAtRisk(streak: number, calendar: StatsResponse["calendar"]): boolean {
  const today = calendar.at(-1);
  return streak > 0 && (today?.count ?? 0) === 0;
}

export function StatsScreen() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  useEffect(() => {
    const controller = new AbortController();
    apiClient.stats(controller.signal).then(setStats).catch((caught: unknown) => {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "통계를 불러오지 못했습니다.");
    });
    return () => controller.abort();
  }, [retryKey]);
  if (error) return <section className="stats-screen"><h1>통계</h1><p role="alert">통계를 불러오지 못했습니다. {error}</p><button onClick={() => { setError(""); setRetryKey((value) => value + 1); }} type="button">다시 시도</button></section>;
  if (!stats) return <p>통계를 불러오는 중…</p>;
  const atRisk = isStreakAtRisk(stats.streak, stats.calendar);
  return (
    <section className="stats-screen">
      <h1>통계</h1>
      <section className={`streak-hero${atRisk ? " streak-hero--at-risk" : ""}`} aria-label="연속 학습">
        <div className="streak-hero__flame" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="52" height="52"><path d="M12 2c1 4-3 5-3 9a3 3 0 006 0c0-1-1-2-1-3 2 1 4 4 4 7a6 6 0 01-12 0C6 9 12 8 12 2z" /></svg>
        </div>
        <div className="streak-hero__copy">
          <strong>{stats.streak}일</strong>
          <span>연속 학습 중</span>
          <small>최장 기록 {stats.longestStreak}일</small>
        </div>
      </section>
      <StreakCalendar calendar={stats.calendar} />
      <div className="track-mastery-grid">
        {stats.tracks.map((progress, index) => (
          <TrackMasteryCard
            cardRef={(node) => { cardRefs.current[index] = node; }}
            index={index}
            key={progress.track}
            onMove={(next) => cardRefs.current[next]?.focus()}
            progress={progress}
            totalCards={stats.tracks.length}
            track={progress.track}
          />
        ))}
      </div>
      <p className="stats-skip"><strong>모름 {stats.skipped}회</strong> · 전체 답변의 {Math.round(stats.skipRate)}%</p>
    </section>
  );
}
