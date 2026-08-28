import { describe, expect, it } from "vitest";
import {
  ANSWER_SPEED_MS,
  dueSort,
  formatDueLabel,
  gradeFromAnswer,
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

  it("maps correctness and answer speed to all grades", () => {
    expect(gradeFromAnswer(false, 1)).toBe("again");
    expect(gradeFromAnswer(true, ANSWER_SPEED_MS.fast)).toBe("easy");
    expect(gradeFromAnswer(true, ANSWER_SPEED_MS.fast + 1)).toBe("good");
    expect(gradeFromAnswer(true, ANSWER_SPEED_MS.slow)).toBe("hard");
  });

  it("formats overdue, current, and future due labels", () => {
    expect(formatDueLabel(dueAt("2025-12-29T00:00:00.000Z"), start)).toEqual({ label: "3일 지남", overdue: true });
    expect(formatDueLabel(dueAt("2026-01-01T23:59:00.000Z"), start)).toEqual({ label: "오늘 만기", overdue: false });
    expect(formatDueLabel(dueAt("2026-01-06T00:00:00.000Z"), start)).toEqual({ label: "5일 후", overdue: false });
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
