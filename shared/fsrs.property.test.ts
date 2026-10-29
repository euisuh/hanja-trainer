import { describe, expect, it } from "vitest";
import { State } from "ts-fsrs";
import { dueSort, formatDueLabel, initialState, isDue, schedule, type Grade, type ReviewState } from "./fsrs";

// mulberry32: fixed-seed PRNG so failures reproduce.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const grades: Grade[] = ["again", "hard", "good", "easy"];
const t0 = new Date("2026-03-01T00:00:00.000Z");

describe("FSRS scheduling invariants (seeded)", () => {
  it.each([1, 2, 3, 42, 2026])("random review walk keeps invariants, seed %d", (seed) => {
    const rand = rng(seed);
    let state = initialState(t0);
    let now = t0;
    for (let i = 0; i < 200; i += 1) {
      // Review anywhere from early (1h) to very late (60d) relative to now.
      now = new Date(now.getTime() + Math.floor(rand() * 60 * 86_400_000) + 3_600_000);
      const grade = grades[Math.floor(rand() * 4)];
      const prev = state;
      const { next, log } = schedule(prev, grade, now);

      expect(next.due.getTime()).toBeGreaterThan(now.getTime());
      expect(next.lastReview?.getTime()).toBe(now.getTime());
      expect(next.reps).toBe(prev.reps + 1);
      expect(next.totalCount).toBe(prev.totalCount + 1);
      expect(next.correctCount).toBe(prev.correctCount + Number(grade !== "again"));
      expect(next.difficulty).toBeGreaterThanOrEqual(1);
      expect(next.difficulty).toBeLessThanOrEqual(10);
      expect(next.stability).toBeGreaterThan(0);
      expect(log.scheduledDaysBefore).toBe(prev.scheduledDays);
      const lapsed = prev.state === State.Review && grade === "again";
      expect(next.lapses).toBe(prev.lapses + Number(lapsed));
      if (lapsed) expect(next.state).toBe(State.Relearning);
      if (next.state === State.Review) expect(next.scheduledDays).toBeGreaterThanOrEqual(1);
      state = next;
    }
  });

  it("is deterministic for identical inputs", () => {
    const a = schedule(initialState(t0), "good", t0).next;
    const b = schedule(initialState(t0), "good", t0).next;
    expect(a).toEqual(b);
  });

  it("grades order the next due time: again <= hard <= good <= easy (review state)", () => {
    const rand = rng(7);
    let state = initialState(t0);
    for (let i = 0; i < 6; i += 1) state = schedule(state, "good", state.due).next;
    for (let i = 0; i < 50; i += 1) {
      const now = new Date(state.due.getTime() + Math.floor(rand() * 30 * 86_400_000));
      const due = (g: Grade) => schedule(state, g, now).next.due.getTime();
      expect(due("again")).toBeLessThanOrEqual(due("hard"));
      expect(due("hard")).toBeLessThanOrEqual(due("good"));
      expect(due("good")).toBeLessThanOrEqual(due("easy"));
    }
  });

  it("dueSort is a due-ascending permutation and isDue matches the cutoff", () => {
    const rand = rng(99);
    const states: ReviewState[] = Array.from({ length: 100 }, () => ({
      ...initialState(t0),
      due: new Date(t0.getTime() + Math.floor((rand() - 0.5) * 20 * 86_400_000)),
    }));
    const sorted = dueSort(states, t0);
    expect(sorted).toHaveLength(states.length);
    expect(new Set(sorted).size).toBe(states.length);
    for (let i = 1; i < sorted.length; i += 1) expect(sorted[i].due.getTime()).toBeGreaterThanOrEqual(sorted[i - 1].due.getTime());
    for (const s of states) expect(isDue(s, t0)).toBe(s.due.getTime() <= t0.getTime());
  });

  it("due label follows local calendar days, independent of time of day", () => {
    const rand = rng(5);
    for (let i = 0; i < 200; i += 1) {
      const now = new Date(2026, 5, 10, Math.floor(rand() * 24), Math.floor(rand() * 60));
      const offset = Math.floor(rand() * 21) - 10;
      const due = new Date(2026, 5, 10 + offset, Math.floor(rand() * 24), Math.floor(rand() * 60));
      const { label, overdue } = formatDueLabel({ ...initialState(t0), due }, now);
      expect(overdue).toBe(offset < 0);
      expect(label).toBe(offset === 0 ? "오늘 만기" : offset < 0 ? `${-offset}일 지남` : `${offset}일 후`);
    }
  });
});
