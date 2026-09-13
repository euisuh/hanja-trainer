import { describe, expect, it } from "vitest";
import type { SessionQueueItem } from "../../../shared/buildQueue";
import { insertCorrection, issuedQueue } from "./correctionQueue";

const card = (id: number): SessionQueueItem => ({
  kind: "reading",
  character: { id, key: String(id), meaningEn: "", meaningKo: "", variants: {}, strokeCount: 1, createdAt: 0, tracks: [{ characterId: id, track: "kr", glyph: String(id), reading: String(id), level: "8급", levelOrd: 1 }], sentences: [] },
  track: "kr",
  options: [{ label: String(id) }],
  answerIndex: 0,
});

const compare = (id: number): SessionQueueItem => ({ kind: "compare", character: card(id).character, track: "kr" });

describe("correction queue", () => {
  it("keeps original card indexes and inserts after three graded originals", () => {
    const queue = insertCorrection(issuedQueue([card(0), card(1), compare(2), card(3), card(4)]), 0);

    expect(queue.map(({ originalCardIndex, correction }) => [originalCardIndex, correction])).toEqual([
      [0, false], [1, false], [2, false], [3, false], [4, false], [0, true],
    ]);
  });

  it("uses the remaining tail and never repeats a correction", () => {
    const once = insertCorrection(issuedQueue([card(0), card(1)]), 1);
    expect(once.at(-1)).toMatchObject({ originalCardIndex: 1, correction: true });
    expect(insertCorrection(once, once.length - 1)).toBe(once);
  });

  it("keeps multiple misses bounded and does not count corrections as spacing", () => {
    let queue = issuedQueue([card(0), card(1), card(2), card(3), card(4)]);
    queue = insertCorrection(queue, 0);
    queue = insertCorrection(queue, 1);

    const corrections = queue.filter(({ correction }) => correction);
    expect(corrections).toHaveLength(2);
    expect(corrections.map(({ originalCardIndex }) => originalCardIndex)).toEqual([0, 1]);
    expect(queue.findIndex(({ originalCardIndex, correction }) => originalCardIndex === 1 && correction)).toBe(6);
  });
});
