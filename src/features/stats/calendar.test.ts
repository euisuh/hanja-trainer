import { describe, expect, it } from "vitest";
import type { ReviewLogEntry } from "../../shared/fsrs";
import { buildCalendar, CALENDAR_DAYS, localDayKey, streakSummary } from "./calendar";

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
});
