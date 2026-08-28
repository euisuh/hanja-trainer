import type { ReviewLogEntry } from "../../shared/fsrs";
import { buildCalendar, streakSummary } from "./calendar";

export function StreakCalendar({ logs }: { logs: ReviewLogEntry[] }) {
  const days = buildCalendar(logs);
  const streak = streakSummary(logs);
  return (
    <section className="streak-calendar">
      <header><strong>최근 18주 학습 기록</strong><span>연속 {streak.current}일 · 최장 {streak.longest}일</span></header>
      <div className="streak-calendar__scroll">
        <div className="streak-calendar__grid">
          {days.map((day) => {
            const label = `${day.key} · 복습 ${day.count}회`;
            return <span aria-label={label} className={`streak-calendar__day streak-calendar__day--${day.level}`} key={day.key} role="img" tabIndex={0} title={label} />;
          })}
        </div>
      </div>
    </section>
  );
}
