import type { StatsCalendarDay } from "../../shared/api";
import { CALENDAR_BUCKET_THRESHOLDS } from "./calendar";

export function StreakCalendar({ calendar }: { calendar: StatsCalendarDay[] }) {
  return (
    <section className="streak-calendar">
      <header><strong>최근 18주 학습 기록</strong></header>
      <div className="streak-calendar__scroll">
        <div className="streak-calendar__grid">
          {calendar.map((day) => {
            const level = day.count >= CALENDAR_BUCKET_THRESHOLDS[2] ? 3 : day.count >= CALENDAR_BUCKET_THRESHOLDS[1] ? 2 : day.count >= CALENDAR_BUCKET_THRESHOLDS[0] ? 1 : 0;
            const label = `${day.date} · 복습 ${day.count}회`;
            return <span aria-label={label} className={`streak-calendar__day streak-calendar__day--${level}`} key={day.date} role="img" tabIndex={0} title={label} />;
          })}
        </div>
      </div>
    </section>
  );
}
