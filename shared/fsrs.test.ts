import { describe, expect, it } from "vitest";
import {
  dueSort,
  formatDueLabel,
  gradeFromAnswer,
  gradeFromReview,
  initialState,
  intervalHistory,
  isDue,
  schedule,
  type ReviewState,
} from "./fsrs";

const start = new Date("2026-01-01T00:00:00.000Z");

function dueAt(date: string): ReviewState {
  return { ...initialState(start), due: new Date(date) };
}

describe("FSRS scheduling", () => {
  it("grows intervals across successful reviews", () => {
    let state = initialState(start);
    const intervals: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      const before = state.due;
      state = schedule(state, "good", before).next;
      intervals.push(state.due.getTime() - before.getTime());
    }

    expect(intervals.every((interval, index) => index === 0 || interval > intervals[index - 1])).toBe(true);
  });

  it("drops stability and increments lapses after forgetting a mature card", () => {
    let state = initialState(start);
    for (let index = 0; index < 4; index += 1) state = schedule(state, "good", state.due).next;

    const mature = state;
    const forgotten = schedule(mature, "again", mature.due).next;
    expect(forgotten.stability).toBeLessThan(mature.stability);
    expect(forgotten.lapses).toBe(mature.lapses + 1);
  });

  it("treats exact due time as due and sorts oldest due first", () => {
    const states = [
      dueAt("2026-01-03T00:00:00.000Z"),
      dueAt("2025-12-29T00:00:00.000Z"),
      dueAt("2026-01-01T00:00:00.000Z"),
    ];
    expect(isDue(states[2], start)).toBe(true);
    expect(dueSort(states, start).map((state) => state.due.toISOString())).toEqual([
      "2025-12-29T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
      "2026-01-03T00:00:00.000Z",
    ]);
  });

  it.each([0, 2_999, 3_000, 3_001, 11_999, 12_000, 3_600_000])("maps correct answers at %d ms to good", (elapsedMs) => {
    expect(gradeFromAnswer(true, elapsedMs)).toBe("good");
    expect(gradeFromReview(true, false, elapsedMs)).toBe("good");
  });

  it.each([0, 2_999, 3_000, 3_001, 11_999, 12_000, 3_600_000])("maps wrong answers at %d ms to again", (elapsedMs) => {
    expect(gradeFromAnswer(false, elapsedMs)).toBe("again");
    expect(gradeFromReview(false, false, elapsedMs)).toBe("again");
  });

  it.each([0, 2_999, 3_000, 3_001, 11_999, 12_000, 3_600_000])("schedules skips at %d ms as again", (elapsedMs) => {
    const wrong = schedule(initialState(start), gradeFromReview(false, false, 1), start).next;
    const skip = schedule(initialState(start), gradeFromReview(false, true, elapsedMs), start).next;

    expect(skip).toEqual(wrong);
  });

  it("formats overdue, current, and future due labels by local calendar day", () => {
    const now = new Date(2026, 0, 1, 0, 0);
    const at = (y: number, m: number, d: number, h = 0, mi = 0) => ({ ...initialState(start), due: new Date(y, m, d, h, mi) });
    expect(formatDueLabel(at(2025, 11, 29), now)).toEqual({ label: "3일 지남", overdue: true });
    expect(formatDueLabel(at(2026, 0, 1, 23, 59), now)).toEqual({ label: "오늘 만기", overdue: false });
    expect(formatDueLabel(at(2026, 0, 6), now)).toEqual({ label: "5일 후", overdue: false });
  });

  it("returns chronological interval history", () => {
    let state = initialState(start);
    const logs = [];
    for (let index = 0; index < 7; index += 1) {
      const result = schedule(state, "good", state.due);
      state = result.next;
      logs.push(result.log);
    }
    const history = intervalHistory(logs);
    expect(history).toHaveLength(7);
    expect(history.every((days, index) => index === 0 || days > history[index - 1])).toBe(true);
  });
});
