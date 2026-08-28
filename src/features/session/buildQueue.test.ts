import { describe, expect, it } from "vitest";
import { initialState } from "../../shared/fsrs";
import type { CharacterEntry, Track } from "../../shared/types";
import { buildQueue, reviewKey } from "./buildQueue";

function character(id: number): CharacterEntry {
  const glyph = String.fromCodePoint(0x4e00 + id);
  return {
    id, key: glyph, meaningEn: `meaning-${id}`, meaningKo: `뜻-${id}`, variants: {}, strokeCount: id, createdAt: 0,
    tracks: (["kr", "jp", "cn"] as Track[]).map((track) => track === "kr"
      ? { characterId: id, track, glyph, reading: `훈 ${id}`, level: "8급", levelOrd: 1 }
      : track === "jp"
        ? { characterId: id, track, glyph, on: `オン${id}`, kun: `くん${id}`, kanken: "10級", jlpt: "N5", levelOrd: 1 }
        : { characterId: id, track, glyph, pinyin: `pin${id}`, meaning: `meaning-${id}`, hsk: "HSK 1", tier: "一级字", levelOrd: 1 }),
    sentences: [],
  };
}

describe("buildQueue", () => {
  const characters = Array.from({ length: 8 }, (_, index) => character(index + 1));

  it("mixes due and new cards with unique same-track options", () => {
    const now = new Date("2026-01-02T00:00:00Z");
    const due = { ...initialState(now), due: new Date("2026-01-01T00:00:00Z"), correctCount: 1, totalCount: 1 };
    const states = new Map([[reviewKey(1, "kr"), due]]);
    const queue = buildQueue({ characters, enabledTracks: ["kr"], length: 6, mode: "lesson", reviewStates: states, now });
    const reading = queue.filter((item) => item.kind === "reading");

    expect(queue).toHaveLength(6);
    expect(reading.some((item) => item.character.id === 1)).toBe(true);
    expect(reading.some((item) => item.character.id !== 1)).toBe(true);
    for (const item of reading) {
      expect(item.track).toBe("kr");
      expect(item.options).toHaveLength(4);
      expect(new Set(item.options.map((option) => option.label)).size).toBe(4);
    }
  });

  it("inserts compare cards only for characters known in multiple tracks", () => {
    const known = { ...initialState(new Date()), correctCount: 2, totalCount: 2 };
    const states = new Map([
      [reviewKey(2, "kr"), known],
      [reviewKey(2, "jp"), known],
      [reviewKey(3, "kr"), known],
    ]);
    const queue = buildQueue({ characters, enabledTracks: ["kr", "jp"], length: 8, mode: "lesson", reviewStates: states });
    const compares = queue.filter((item) => item.kind === "compare");

    expect(compares).toHaveLength(2);
    expect(compares.every((item) => item.character.id === 2)).toBe(true);
  });

  it("uses only enabled tracks and due items in review mode", () => {
    const now = new Date("2026-01-02T00:00:00Z");
    const due = { ...initialState(now), due: new Date("2026-01-01T00:00:00Z") };
    const states = new Map([[reviewKey(4, "cn"), due]]);
    const queue = buildQueue({ characters, enabledTracks: ["cn"], length: 3, mode: "review", reviewStates: states, now });

    expect(queue).toHaveLength(3);
    expect(queue.every((item) => item.track === "cn" && item.character.id === 4)).toBe(true);
  });
});
