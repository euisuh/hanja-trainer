import type { ReviewLogEntry } from "../../../shared/fsrs";

export const CALENDAR_DAYS = 18 * 7;
export const CALENDAR_BUCKET_THRESHOLDS = [1, 3, 6] as const;

export type CalendarDay = { date: Date; key: string; count: number; level: 0 | 1 | 2 | 3 };

export function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

export function reviewCountsByDay(logs: ReviewLogEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const log of logs) {
    const key = localDayKey(log.answeredAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function buildCalendar(logs: ReviewLogEntry[], today = new Date()): CalendarDay[] {
  const counts = reviewCountsByDay(logs);
  return Array.from({ length: CALENDAR_DAYS }, (_, index) => {
    const date = addDays(today, index - CALENDAR_DAYS + 1);
    const key = localDayKey(date);
    const count = counts.get(key) ?? 0;
    const level = count >= CALENDAR_BUCKET_THRESHOLDS[2] ? 3 : count >= CALENDAR_BUCKET_THRESHOLDS[1] ? 2 : count >= CALENDAR_BUCKET_THRESHOLDS[0] ? 1 : 0;
    return { date, key, count, level };
  });
}

export function streakSummary(logs: ReviewLogEntry[], today = new Date()): { current: number; longest: number } {
  const counts = reviewCountsByDay(logs);
  const activeKeys = [...counts.entries()].filter(([, count]) => count > 0).map(([key]) => key).sort();
  let longest = 0;
  let run = 0;
  let previous: string | undefined;
  for (const key of activeKeys) {
    const [year, month, day] = key.split("-").map(Number);
    const [previousYear, previousMonth, previousDay] = previous?.split("-").map(Number) ?? [];
    const consecutive = previous !== undefined && Date.UTC(year, month - 1, day) - Date.UTC(previousYear, previousMonth - 1, previousDay) === 86_400_000;
    run = consecutive ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = key;
  }
  let cursor = counts.has(localDayKey(today)) ? addDays(today, 0) : addDays(today, -1);
  let current = 0;
  while ((counts.get(localDayKey(cursor)) ?? 0) > 0) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return { current, longest };
}
