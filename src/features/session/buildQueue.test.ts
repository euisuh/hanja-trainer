import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSeed } from "../../../scripts/seed";
import { initialState } from "../../shared/fsrs";
import type { CharacterEntry, SeedCharacterEntry, Track, TrackEntry } from "../../shared/types";
import { buildQueue, buildReadingItem, reviewKey } from "./buildQueue";

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

function random(seed: number): () => number {
  let value = seed;
  return () => ((value = Math.imul(value, 1_664_525) + 1_013_904_223 >>> 0) / 4_294_967_296);
}

function withReadings(id: number, jp: string, cn: string): CharacterEntry {
  const base = character(id);
  return {
    ...base,
    tracks: base.tracks.map((entry) => entry.track === "jp" ? { ...entry, on: jp } : entry.track === "cn" ? { ...entry, pinyin: cn } : entry),
  };
}

function seededCharacters(): CharacterEntry[] {
  const files = ["kr-8geup", "kr-7geup", "jp-kanken-10", "jp-kanken-9", "cn-hsk1", "cn-hsk2"];
  const merged = new Map<string, SeedCharacterEntry>();
  for (const file of files) {
    for (const item of parseSeed(JSON.parse(readFileSync(`data/characters/${file}.json`, "utf8")) as unknown).characters) {
      const existing = merged.get(item.key);
      merged.set(item.key, existing ? { ...existing, tracks: [...existing.tracks, ...item.tracks.filter((entry) => !existing.tracks.some((known) => known.track === entry.track))] } : item);
    }
  }
  return [...merged.values()].map((item, index) => ({
    ...item,
    id: index + 1,
    createdAt: 0,
    tracks: item.tracks.map((entry) => ({ ...entry, characterId: index + 1 }) as TrackEntry),
    sentences: [],
  }));
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

  it("adds compare interstitials for a character known in one enabled track", () => {
    const known = { ...initialState(new Date()), correctCount: 2, totalCount: 2 };
    const states = new Map([
      [reviewKey(2, "kr"), known],
    ]);
    const queue = buildQueue({ characters, enabledTracks: ["kr", "jp"], length: 8, mode: "lesson", reviewStates: states });
    const compares = queue.filter((item) => item.kind === "compare");

    expect(compares).toHaveLength(1);
    expect(queue.filter((item) => item.kind === "reading")).toHaveLength(8);
    expect(compares.every((item) => item.character.id === 2)).toBe(true);
    expect(compares.every((item) => item.character.tracks.length === 2)).toBe(true);
  });

  it("does not add compare cards when only one track is enabled", () => {
    const known = { ...initialState(new Date()), correctCount: 1, totalCount: 1 };
    const queue = buildQueue({ characters, enabledTracks: ["kr"], length: 8, mode: "lesson", reviewStates: new Map([[reviewKey(1, "kr"), known]]) });

    expect(queue).toHaveLength(8);
    expect(queue.every((item) => item.kind === "reading")).toBe(true);
  });

  it("balances placement cards across tracks and their full level ranges", () => {
    const queue = buildQueue({ characters: seededCharacters(), enabledTracks: ["kr", "jp", "cn"], length: 15, mode: "placement" });

    expect(queue.map((item) => item.track)).toEqual(Array.from({ length: 15 }, (_, index) => (["kr", "jp", "cn"] as const)[index % 3]));
    expect(new Set(queue.map((item) => `${item.character.id}:${item.track}`)).size).toBe(15);
    for (const [track, levels] of [["kr", [1, 2, 3]], ["jp", [1, 2]], ["cn", [1, 2]]] as const) {
      expect([...new Set(queue.filter((item) => item.track === track).map((item) => item.character.tracks.find((entry) => entry.track === track)?.levelOrd))].sort()).toEqual(levels);
    }
  });

  it("uses only enabled tracks and due items in review mode", () => {
    const now = new Date("2026-01-02T00:00:00Z");
    const states = new Map([
      [reviewKey(4, "cn"), { ...initialState(now), due: new Date("2026-01-01T00:00:00Z") }],
      [reviewKey(5, "cn"), { ...initialState(now), due: new Date("2025-12-29T00:00:00Z") }],
    ]);
    const queue = buildQueue({ characters, enabledTracks: ["cn"], length: 2, mode: "review", reviewStates: states, now });

    expect(queue).toHaveLength(2);
    expect(queue.every((item) => item.kind === "reading" && item.track === "cn")).toBe(true);
    expect(queue.map((item) => item.character.id)).toEqual([5, 4]);
  });

  it("does not duplicate due items to fill a review limit", () => {
    const now = new Date("2026-01-02T00:00:00Z");
    const states = new Map([
      [reviewKey(4, "cn"), { ...initialState(now), due: new Date("2026-01-01T00:00:00Z") }],
      [reviewKey(5, "cn"), { ...initialState(now), due: new Date("2025-12-29T00:00:00Z") }],
    ]);

    expect(buildQueue({ characters, enabledTracks: ["cn"], length: 8, mode: "review", reviewStates: states, now })).toHaveLength(2);
  });

  it("does not repeat fresh cards when no cards are due", () => {
    const queue = buildQueue({ characters, enabledTracks: ["kr"], length: 8, mode: "lesson" });
    const keys = queue.map((item) => `${item.character.id}:${item.track}`);

    expect(queue).toHaveLength(8);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("does not repeat pairs with partial due state or compare cards", () => {
    const now = new Date("2026-01-02T00:00:00Z");
    const due = { ...initialState(now), due: new Date("2026-01-01T00:00:00Z"), correctCount: 1 };
    const known = { ...initialState(now), correctCount: 1 };
    const states = new Map([
      [reviewKey(1, "kr"), due],
      [reviewKey(2, "kr"), known],
      [reviewKey(2, "jp"), known],
    ]);
    const queue = buildQueue({ characters, enabledTracks: ["kr", "jp"], length: 8, mode: "lesson", reviewStates: states, now });
    const reading = queue.filter((item) => item.kind === "reading");
    const keys = reading.map((item) => `${item.character.id}:${item.track}`);

    expect(queue.some((item) => item.kind === "compare")).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
    expect(reading).toHaveLength(8);
  });

  it("adds relevant compare interstitials to review sessions", () => {
    const now = new Date("2026-01-02T00:00:00Z");
    const states = new Map(characters.flatMap((item) => (["kr", "jp"] as const).map((track) => [reviewKey(item.id, track), { ...initialState(now), due: new Date("2026-01-01T00:00:00Z"), correctCount: 1 }] as const)));
    const queue = buildQueue({ characters, enabledTracks: ["kr", "jp"], length: 8, mode: "review", reviewStates: states, now, random: random(3) });
    const reading = queue.filter((item) => item.kind === "reading");
    const compares = queue.filter((item) => item.kind === "compare");

    expect(reading).toHaveLength(8);
    expect(compares).toHaveLength(2);
    expect(reading.slice(0, 4).map((item) => item.character.id)).toContain(compares[0].character.id);
    expect(reading.slice(4, 8).map((item) => item.character.id)).toContain(compares[1].character.id);
  });

  it("varies relevant compare characters with the session seed", () => {
    const known = { ...initialState(new Date()), correctCount: 1, totalCount: 1 };
    const states = new Map(characters.map((item) => [reviewKey(item.id, "kr"), known]));
    const first = buildQueue({ characters, enabledTracks: ["kr", "jp"], length: 8, mode: "lesson", reviewStates: states, random: random(1) });
    const second = buildQueue({ characters, enabledTracks: ["kr", "jp"], length: 8, mode: "lesson", reviewStates: states, random: random(2) });

    expect(first.filter((item) => item.kind === "compare").map((item) => item.character.id)).not.toEqual(second.filter((item) => item.kind === "compare").map((item) => item.character.id));
  });

  it("returns a short queue instead of padding repeated pairs", () => {
    const queue = buildQueue({ characters: characters.slice(0, 5), enabledTracks: ["kr"], length: 8, mode: "lesson" });

    expect(queue).toHaveLength(5);
    expect(new Set(queue.map((item) => `${item.character.id}:${item.track}`)).size).toBe(5);
  });

  it.each([1, 2, 3, 4])("handles a track with %i characters without throwing", (count) => {
    const queue = buildQueue({ characters: characters.slice(0, count), enabledTracks: ["kr"], length: 8, mode: "lesson" });

    expect(queue).toHaveLength(count < 4 ? 0 : count);
    expect(queue.every((item) => item.kind === "reading" && item.options.length === 4)).toBe(true);
  });

  it.each(["jp", "cn"] as const)("emits only reading labels for %s options", (track) => {
    const queue = buildQueue({ characters, enabledTracks: [track], length: 1, mode: "lesson" });
    const item = queue[0];
    const entry = item?.character.tracks.find((candidate) => candidate.track === track);

    expect(item?.kind).toBe("reading");
    if (!item || item.kind !== "reading" || !entry) return;
    expect(item.options.every((option) => Object.keys(option).join() === "label")).toBe(true);
    expect(item.options.some((option) => option.label.includes(item.character.meaningEn) || option.label.includes(item.character.meaningKo))).toBe(false);
    if (entry.track === "jp") expect(item.options.some((option) => option.label.includes(entry.kun))).toBe(false);
  });

  it("prioritizes pinyin tone variants and Japanese minimal pairs", () => {
    const cn = ["bā", "bá", "bǎ", "bà", "tā", "mā"].map((reading, index) => withReadings(index + 1, `オン${index}`, reading));
    const jp = ["シン", "ジン", "セン", "サン", "リン", "キン"].map((reading, index) => withReadings(index + 1, reading, `pin${index}`));
    const cnItem = buildReadingItem(cn[0], "cn", cn, 0, random(1));
    const jpItem = buildReadingItem(jp[0], "jp", jp, 0, random(1));

    expect(cnItem?.options.some((option) => option.label !== "bā" && option.label.normalize("NFD").replace(/\p{Mn}/gu, "") === "ba")).toBe(true);
    expect(jpItem?.options.some((option) => option.label === "ジン")).toBe(true);
  });

  it("keeps Japanese option shape non-unique when the corpus offers a match", () => {
    const readings = ["イチ・イツ", "ニ・ジ", "シチ", "シツ", "イチ", "イツ"];
    const corpus = readings.map((reading, index) => withReadings(index + 1, reading, `pin${index}`));
    const item = buildReadingItem(corpus[0], "jp", corpus, 0, random(2));

    expect(item?.options.filter((option) => option.label.split("・").length === 2).length).toBeGreaterThan(1);
  });

  it("randomizes phonetic distractors while preserving the Korean set", () => {
    const cn = ["bā", "bá", "bǎ", "bà", "tā", "mā", "dā", "lā"].map((reading, index) => withReadings(index + 1, `オン${index}`, reading));
    const first = buildReadingItem(cn[0], "cn", cn, 0, random(1));
    const second = buildReadingItem(cn[0], "cn", cn, 0, random(2));
    const krFirst = buildReadingItem(character(1), "kr", characters, 0, random(1));
    const krSecond = buildReadingItem(character(1), "kr", characters, 0, random(2));

    expect(first?.options.map((option) => option.label).sort()).not.toEqual(second?.options.map((option) => option.label).sort());
    expect(krFirst?.options).toEqual(krSecond?.options);
    expect(krFirst?.options.map((option) => option.label)).toEqual(["훈 1", "훈 2", "훈 3", "훈 4"]);
  });

  it("is deterministic with a fixed seed", () => {
    const first = buildQueue({ characters, enabledTracks: ["jp", "cn"], length: 8, mode: "lesson", random: random(7) });
    const second = buildQueue({ characters, enabledTracks: ["jp", "cn"], length: 8, mode: "lesson", random: random(7) });

    expect(first).toEqual(second);
  });

  it("builds four unique options for every seeded track entry", () => {
    const corpus = seededCharacters();
    for (const item of corpus) {
      for (const entry of item.tracks) {
        const card = buildReadingItem(item, entry.track, corpus, item.id, random(item.id));
        expect(card, `${item.key}:${entry.track}`).toBeDefined();
        expect(new Set(card?.options.map((option) => option.label)).size, `${item.key}:${entry.track}`).toBe(4);
        if (entry.track === "jp" && corpus.some((candidate) => candidate.id !== item.id && candidate.tracks.some((other) => other.track === "jp" && other.on !== entry.on && other.on.split("・").length === entry.on.split("・").length))) {
          expect(card?.options.filter((option) => option.label.split("・").length === entry.on.split("・").length).length, `${item.key}:jp shape`).toBeGreaterThan(1);
        }
      }
    }
  });
});
