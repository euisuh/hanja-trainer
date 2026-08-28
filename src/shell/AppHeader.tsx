import { loadAllDemoLogs } from "../features/session/demoData";
import { streakSummary } from "../features/stats/calendar";

type Props = { streak?: number; xp?: number; today?: number; goal?: number };

export function goalDegrees(today: number, goal: number): number {
  return goal <= 0 ? 0 : Math.min(360, Math.max(0, 360 * today / goal));
}

// ponytail: #16 will replace these local solo-profile metrics.
export function AppHeader({ streak, xp = 4_820, today = 24, goal = 40 }: Props) {
  const degrees = goalDegrees(today, goal);
  const currentStreak = streak ?? streakSummary(loadAllDemoLogs()).current;
  return (
    <header className="app-header" aria-label="오늘의 학습 현황">
      <div className="metric">
        <svg aria-hidden="true" className="metric__flame" height="15" viewBox="0 0 24 24" width="15"><path d="M12 2c1 4-3 5-3 9a3 3 0 006 0c0-1-1-2-1-3 2 1 4 4 4 7a6 6 0 01-12 0C6 9 12 8 12 2z" /></svg>
        <strong>{currentStreak}</strong><span>연속</span>
      </div>
      <div className="metric">
        <svg aria-hidden="true" className="metric__bolt" height="14" viewBox="0 0 24 24" width="14"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" /></svg>
        <strong>{xp.toLocaleString()}</strong><span>XP</span>
      </div>
      <div className="daily-goal">
        <span className="daily-goal__ring" role="img" aria-label={`일일 목표 ${Math.round(degrees / 3.6)}% 달성`} style={{ "--goal-degrees": `${degrees}deg` } as React.CSSProperties} />
        <strong>오늘 {today}/{goal} XP</strong>
      </div>
    </header>
  );
}
