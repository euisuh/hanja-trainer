import { useMemo, useRef } from "react";
import { loadOnboardingProfile } from "../features/onboarding/tracks";
import { demoCharacters, loadAllDemoLogs, loadDemoStates } from "../features/session/demoData";
import { levelProgress } from "../features/stats/levelProgress";
import { StreakCalendar } from "../features/stats/StreakCalendar";
import { TrackMasteryCard } from "../features/stats/TrackMasteryCard";
import "../features/stats/stats.css";

export function StatsScreen() {
  const enabledTracks = useMemo(() => loadOnboardingProfile().enabledTracks, []);
  const logs = useMemo(() => loadAllDemoLogs(), []);
  const states = useMemo(() => loadDemoStates(), []);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  return (
    <section className="stats-screen">
      <h1>통계</h1>
      <StreakCalendar logs={logs} />
      <div className="track-mastery-grid">
        {enabledTracks.map((track, index) => (
          <TrackMasteryCard
            cardRef={(node) => { cardRefs.current[index] = node; }}
            index={index}
            key={track}
            onMove={(next) => cardRefs.current[next]?.focus()}
            progress={levelProgress(track, demoCharacters, states)}
            totalCards={enabledTracks.length}
            track={track}
          />
        ))}
      </div>
    </section>
  );
}
