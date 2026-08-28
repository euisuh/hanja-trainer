import { useEffect, useRef, useState } from "react";
import { StreakCalendar } from "../features/stats/StreakCalendar";
import { TrackMasteryCard } from "../features/stats/TrackMasteryCard";
import "../features/stats/stats.css";
import { apiClient } from "../lib/apiClient";
import type { StatsResponse } from "../shared/api";

export function StatsScreen() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  useEffect(() => {
    const controller = new AbortController();
    apiClient.stats(controller.signal).then(setStats).catch(() => undefined);
    return () => controller.abort();
  }, []);
  if (!stats) return <p>통계를 불러오는 중…</p>;
  return (
    <section className="stats-screen">
      <h1>통계</h1>
      <StreakCalendar calendar={stats.calendar} longestStreak={stats.longestStreak} streak={stats.streak} />
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
    </section>
  );
}
