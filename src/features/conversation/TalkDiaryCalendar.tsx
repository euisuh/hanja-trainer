import type { StatsCalendarDay } from "../../../shared/api";

type Props = { calendar: StatsCalendarDay[]; spokenDaysThisWeek: number };

export function TalkDiaryCalendar({ calendar, spokenDaysThisWeek }: Props) {
  return (
    <section className="talk-diary-calendar" aria-label="말하기 일기">
      <header><strong>말하기 일기</strong><span>{spokenDaysThisWeek} days spoken this week</span></header>
      <div className="talk-diary-calendar__grid">
        {calendar.map((day) => {
          const label = `${day.date} · 말하기 ${day.count}회`;
          return <span aria-label={label} className={`talk-diary-calendar__day${day.count > 0 ? " talk-diary-calendar__day--spoken" : ""}`} key={day.date} role="img" title={label} />;
        })}
      </div>
    </section>
  );
}
