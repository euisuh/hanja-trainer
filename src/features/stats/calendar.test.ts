import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { isStreakAtRisk } from "../../screens/StatsScreen";
import type { StatsResponse } from "../../../shared/api";
import type { ReviewLogEntry } from "../../../shared/fsrs";
import { buildCalendar, CALENDAR_DAYS, localDayKey, streakSummary } from "./calendar";
import { StreakCalendar } from "./StreakCalendar";

function log(answeredAt: Date): ReviewLogEntry {
  return { rating: "good", answeredAt, scheduledDaysBefore: 1, scheduledDaysAfter: 2 };
}

describe("stats calendar", () => {
  it("buckets 18 local weeks with named count thresholds", () => {
    const today = new Date(2026, 7, 28, 12);
    const logs = Array.from({ length: 6 }, () => log(new Date(2026, 7, 28, 23, 30)));
    const days = buildCalendar(logs, today);
    expect(days).toHaveLength(CALENDAR_DAYS);
    expect(days.at(-1)).toMatchObject({ key: "2026-08-28", count: 6, level: 3 });
    expect(localDayKey(new Date(2026, 7, 28, 23, 59))).toBe("2026-08-28");
  });

  it("does not break the current streak before today's first review", () => {
    const today = new Date(2026, 7, 28, 10);
    const logs = [25, 26, 27].map((day) => log(new Date(2026, 7, day, 22)));
    expect(streakSummary(logs, today)).toEqual({ current: 3, longest: 3 });
  });

  it("finds the longest run across gaps and handles a new install", () => {
    const logs = [1, 2, 4, 5, 6].map((day) => log(new Date(2026, 7, day)));
    expect(streakSummary(logs, new Date(2026, 7, 8))).toEqual({ current: 0, longest: 3 });
    expect(streakSummary([], new Date(2026, 7, 8))).toEqual({ current: 0, longest: 0 });
  });

  it("flags an active streak before today's first review", () => {
    const calendar: StatsResponse["calendar"] = [{ date: "2026-08-28", count: 0 }];
    expect(isStreakAtRisk(3, calendar)).toBe(true);
    expect(isStreakAtRisk(0, calendar)).toBe(false);
    expect(isStreakAtRisk(3, [{ ...calendar[0], count: 1 }])).toBe(false);
  });

  it("keeps streak copy out of the activity calendar header", () => {
    const markup = renderToStaticMarkup(StreakCalendar({ calendar: [] }));
    expect(markup).toContain("최근 18주 학습 기록");
    expect(markup).not.toContain("연속");
    expect(markup).not.toContain("최장");
  });
});
