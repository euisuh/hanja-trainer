import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSeed } from "../../scripts/seed";
import { initialState } from "./fsrs";
import type { CharacterEntry, SeedCharacterEntry, Track, TrackEntry, WordEntry } from "./types";
import { buildKunItem, buildMeaningItem, buildQueue, buildReadingItem, buildUnitTestQueue, buildWordItem, meaningFor, reviewKey } from "./buildQueue";

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

function withKorean(id: number, reading: string): CharacterEntry {
  const base = character(id);
  return { ...base, tracks: base.tracks.map((entry) => entry.track === "kr" ? { ...entry, reading } : entry) };
}

function word(id: number, reading: string, members: [number, number] = [1, 2], track: Track = "kr"): WordEntry {
  const sourceHost = { kr: "ko", jp: "ja", cn: "zh" }[track];
  return {
    id,
    track,
    glyph: members.map((member) => character(member).key).join(""),
    reading,
    level: track === "kr" ? "8급" : track === "jp" ? "N5" : "HSK 1",
    levelOrd: 1,
    sourceUrl: `https://${sourceHost}.wiktionary.org/w/index.php?title=${reading}&oldid=${id}`,
    members: members.map((characterId, position) => ({ characterId, key: character(characterId).key, position })),
  };
}

function seededCharacters(): CharacterEntry[] {
  const files = ["kr-8geup", "kr-7geup", "jp-jlpt-n5", "jp-jlpt-n4", "cn-hsk1", "cn-hsk2"];
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
    const recall = queue.filter((item) => item.kind !== "compare" && item.kind !== "word");

    expect(queue).toHaveLength(6);
    expect(recall.some((item) => item.character.id === 1)).toBe(true);
    expect(recall.some((item) => item.character.id !== 1)).toBe(true);
    for (const item of recall) {
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
    expect(queue.filter((item) => item.kind !== "compare")).toHaveLength(8);
    expect(queue.some((item) => item.kind === "meaning")).toBe(true);
    expect(compares.every((item) => item.character.id === 2)).toBe(true);
    expect(compares.every((item) => item.character.tracks.length === 2)).toBe(true);
  });

  it("does not add compare cards when only one track is enabled", () => {
    const known = { ...initialState(new Date()), correctCount: 1, totalCount: 1 };
    const queue = buildQueue({ characters, enabledTracks: ["kr"], length: 8, mode: "lesson", reviewStates: new Map([[reviewKey(1, "kr"), known]]) });

    expect(queue).toHaveLength(8);
    expect(queue.every((item) => item.kind !== "compare" && item.kind !== "word")).toBe(true);
    expect(queue.some((item) => item.kind === "meaning")).toBe(true);
  });

  it("balances placement cards across tracks and their full level ranges", () => {
    const queue = buildQueue({ characters: seededCharacters(), enabledTracks: ["kr", "jp", "cn"], length: 15, mode: "placement" });

    expect(queue.map((item) => item.track)).toEqual(Array.from({ length: 15 }, (_, index) => (["kr", "jp", "cn"] as const)[index % 3]));
    expect(new Set(queue.map((item) => `${item.character.id}:${item.track}`)).size).toBe(15);
    for (const [track, levels] of [["kr", [1, 2, 3]], ["jp", [1, 2]], ["cn", [1, 2]]] as const) {
      expect([...new Set(queue.filter((item) => item.track === track).map((item) => item.character.tracks.find((entry) => entry.track === track)?.levelOrd))].sort()).toEqual(levels);
    }
  });

  it("uses non-curriculum entries as placement distractors, not questions", () => {
    const queue = buildQueue({ characters, enabledTracks: ["kr"], length: 1, mode: "placement", placementKeys: new Set([reviewKey(1, "kr")]) });
    const item = queue[0];

    expect(item?.character.id).toBe(1);
    expect(item?.kind).toBe("reading");
    if (item?.kind === "reading") expect(new Set(item.options.map((option) => option.label))).toEqual(new Set(["훈 1", "훈 2", "훈 3", "훈 4"]));
  });

  it("uses only enabled tracks and due items in review mode", () => {
    const now = new Date("2026-01-02T00:00:00Z");
    const states = new Map([
      [reviewKey(4, "cn"), { ...initialState(now), due: new Date("2026-01-01T00:00:00Z") }],
      [reviewKey(5, "cn"), { ...initialState(now), due: new Date("2025-12-29T00:00:00Z") }],
    ]);
    const queue = buildQueue({ characters, enabledTracks: ["cn"], length: 2, mode: "review", reviewStates: states, now });

    expect(queue).toHaveLength(2);
    expect(queue.every((item) => item.kind !== "compare" && item.kind !== "word" && item.track === "cn")).toBe(true);
    expect(new Set(queue.map((item) => item.kind))).toEqual(new Set(["reading", "meaning"]));
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

  it("filters level reviews by selected level regardless of FSRS state", () => {
    const now = new Date("2026-01-02T00:00:00Z");
    const states = new Map([
      [reviewKey(1, "kr"), { ...initialState(now), due: new Date("2027-01-01T00:00:00Z"), correctCount: 10 }],
      [reviewKey(3, "kr"), { ...initialState(now), due: new Date("2026-01-01T00:00:00Z") }],
    ]);
    const queue = buildQueue({
      characters,
      enabledTracks: ["kr"],
      length: 8,
      mode: "level-review",
      reviewStates: states,
      levelReviewKeys: new Set([reviewKey(1, "kr"), reviewKey(2, "kr")]),
      now,
    });

    expect(queue).toHaveLength(2);
    expect(queue.map((item) => item.character.id)).toEqual([1, 2]);
    expect(new Set(queue.map((item) => item.kind))).toEqual(new Set(["reading", "meaning"]));
  });

  it("covers every character in a unit review larger than the lesson size", () => {
    const unitCharacters = Array.from({ length: 10 }, (_, index) => character(index + 1));
    const keys = new Set(unitCharacters.map((item) => reviewKey(item.id, "kr")));
    const queue = buildQueue({ characters: unitCharacters, enabledTracks: ["kr"], length: 10, mode: "level-review", levelReviewKeys: keys, random: random(1) });
    const reviewed = queue.filter((item) => item.kind !== "compare" && item.kind !== "word").map((item) => item.character.id);

    expect(reviewed).toHaveLength(10);
    expect(new Set(reviewed)).toEqual(new Set(unitCharacters.map((item) => item.id)));
  });

  it("rotates a bounded whole-level sample with the session seed", () => {
    const levelCharacters = Array.from({ length: 30 }, (_, index) => character(index + 1));
    const keys = new Set(levelCharacters.map((item) => reviewKey(item.id, "kr")));
    const sample = (seed: number) => buildQueue({ characters: levelCharacters, enabledTracks: ["kr"], length: 20, mode: "level-review", levelReviewKeys: keys, random: random(seed) })
      .filter((item) => item.kind !== "compare" && item.kind !== "word").map((item) => item.character.id);
    const first = sample(1);
    const second = sample(2);

    expect(first).toHaveLength(20);
    expect(new Set(first).size).toBe(20);
    expect(first).not.toEqual(second);
    expect(new Set(first)).not.toEqual(new Set(second));
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
    const recall = queue.filter((item) => item.kind !== "compare" && item.kind !== "word");
    const keys = recall.map((item) => `${item.character.id}:${item.track}`);

    expect(queue.some((item) => item.kind === "compare")).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
    expect(recall).toHaveLength(8);
  });

  it("adds relevant compare interstitials to review sessions", () => {
    const now = new Date("2026-01-02T00:00:00Z");
    const states = new Map(characters.flatMap((item) => (["kr", "jp"] as const).map((track) => [reviewKey(item.id, track), { ...initialState(now), due: new Date("2026-01-01T00:00:00Z"), correctCount: 1 }] as const)));
    const queue = buildQueue({ characters, enabledTracks: ["kr", "jp"], length: 8, mode: "review", reviewStates: states, now, random: random(3) });
    const recall = queue.filter((item) => item.kind !== "compare" && item.kind !== "word");
    const compares = queue.filter((item) => item.kind === "compare");

    expect(recall).toHaveLength(8);
    expect(compares).toHaveLength(2);
    expect(recall.slice(0, 4).map((item) => item.character.id)).toContain(compares[0].character.id);
    expect(recall.slice(4, 8).map((item) => item.character.id)).toContain(compares[1].character.id);
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
    expect(queue.every((item) => item.kind !== "compare" && item.kind !== "word" && item.options.length === 4)).toBe(true);
  });

  it.each(["jp", "cn"] as const)("emits only reading labels for %s options", (track) => {
    const item = buildReadingItem(characters[0], track, characters, 0);
    const entry = item?.character.tracks.find((candidate) => candidate.track === track);

    expect(item?.kind).toBe("reading");
    if (!item || item.kind !== "reading" || !entry) return;
    expect(item.options.every((option) => Object.keys(option).join() === "label")).toBe(true);
    expect(item.options.some((option) => option.label.includes(item.character.meaningEn) || option.label.includes(item.character.meaningKo))).toBe(false);
    if (entry.track === "jp") expect(item.options.some((option) => option.label.includes(entry.kun))).toBe(false);
  });

  it("keeps Korean glosses for Korean and Japanese tracks", () => {
    const item = character(1);
    expect(meaningFor(item, "kr")).toEqual({ label: item.meaningKo });
    expect(meaningFor(item, "jp")).toEqual({ label: item.meaningKo });
  });

  it("uses modern Chinese definitions for Chinese answers and distractors", () => {
    const corpus = seededCharacters();
    const chineseMeanings = new Set(corpus.flatMap((item) => item.tracks.flatMap((entry) => entry.track === "cn" ? [entry.meaning] : [])));
    for (const [key, expected, wrongGloss] of [["吃", "eat", "말 더듬을"], ["的", "possessive, adjectival suffix", "과녁"]] as const) {
      const item = corpus.find((candidate) => candidate.key === key);
      expect(item, key).toBeDefined();
      if (!item) continue;
      const card = buildMeaningItem(item, "cn", corpus, 0, random(item.id));
      expect(card?.options[card.answerIndex]).toEqual({ label: expected });
      expect(card?.options.every(({ label }) => chineseMeanings.has(label))).toBe(true);
      expect(card?.options.some(({ label }) => label === wrongGloss)).toBe(false);
    }
  });

  it.each(["lesson", "review"] as const)("mixes track-correct meaning recall into %s queues", (mode) => {
    const now = new Date("2026-01-02T00:00:00Z");
    for (const track of ["kr", "jp", "cn"] as const) {
      const reviewStates = mode === "review" ? new Map(characters.map((item) => [reviewKey(item.id, track), { ...initialState(now), due: new Date("2026-01-01T00:00:00Z") }])) : undefined;
      const queue = buildQueue({ characters, enabledTracks: [track], length: 8, mode, reviewStates, now });
      const meanings = queue.filter((item) => item.kind === "meaning");
      expect(meanings.length, track).toBeGreaterThan(0);
      for (const item of meanings) {
        const entry = item.character.tracks.find((candidate) => candidate.track === track);
        expect(item.options[item.answerIndex].label).toBe(entry?.track === "cn" ? entry.meaning : item.character.meaningKo);
        expect(item.options.every((option) => option.label.startsWith(track === "cn" ? "meaning-" : "뜻-"))).toBe(true);
      }
    }
  });

  it("ranks meaning distractors by level proximity instead of pronunciation", () => {
    const readings = ["장인 공", "글월 문", "물 수", "불 화", "빌 공", "강 강"];
    const levels = [3, 3, 4, 2, 1, 5];
    const corpus = readings.map((reading, index) => {
      const item = withKorean(index + 1, reading);
      return { ...item, tracks: item.tracks.map((entry) => entry.track === "kr" ? { ...entry, levelOrd: levels[index] } : entry) };
    });
    const item = buildQueue({ characters: corpus, enabledTracks: ["kr"], length: 1, mode: "lesson" })[0];

    expect(item?.kind).toBe("meaning");
    if (item?.kind !== "meaning") return;
    expect(new Set(item.options.map((option) => option.label))).toEqual(new Set(["뜻-1", "뜻-2", "뜻-3", "뜻-4"]));
    expect(item.options.some((option) => option.label === "뜻-5")).toBe(false);
  });

  it("quizzes Japanese kun readings without ever offering the なし sentinel", () => {
    const corpus = characters.map((item, index) => ({
      ...item,
      tracks: item.tracks.map((entry) => entry.track === "jp" && index === 0 ? { ...entry, kun: "なし" } : entry),
    }));
    const queue = buildQueue({ characters: corpus, enabledTracks: ["jp"], length: 8, mode: "lesson", random: random(3) });
    const kun = queue.filter((item) => item.kind === "kun");

    expect(kun.length).toBeGreaterThan(0);
    expect(kun.every((item) => item.character.id !== 1)).toBe(true);
    expect(kun.flatMap((item) => item.options).every((option) => option.label !== "なし")).toBe(true);
  });

  it("prioritizes pinyin tone variants and Japanese minimal pairs", () => {
    const cn = ["bā", "bá", "bǎ", "bà", "tā", "mā"].map((reading, index) => withReadings(index + 1, `オン${index}`, reading));
    const jp = ["シン", "ジン", "セン", "サン", "リン", "キン"].map((reading, index) => withReadings(index + 1, reading, `pin${index}`));
    const cnItem = buildReadingItem(cn[0], "cn", cn, 0, random(1));
    const jpItem = buildReadingItem(jp[0], "jp", jp, 0, random(1));

    expect(cnItem?.options.some((option) => option.label !== "bā" && option.label.normalize("NFD").replace(/\p{Mn}/gu, "") === "ba")).toBe(true);
    expect(jpItem?.options.some((option) => option.label === "ジン")).toBe(true);
  });

  it("prioritizes Korean readings with the same or a similar final sound", () => {
    const corpus = ["장인 공", "빌 공", "강 강", "글월 문", "물 수", "불 화"].map((reading, index) => withKorean(index + 1, reading));
    const item = buildReadingItem(corpus[0], "kr", corpus, 0, random(1));

    expect(item?.options.slice(1, 3).map((option) => option.label)).toEqual(["빌 공", "강 강"]);
  });

  it("ranks compound near misses through the compound-specific distractor path", () => {
    const words = ["학교", "학고", "악교", "부모", "정답"].map((reading, index) => word(index + 1, reading));
    const item = buildWordItem(words[0], words, characters[0], 0, random(1));

    expect(item?.options.slice(1, 3).map((option) => option.label)).toEqual(["학고", "악교"]);
  });

  it.each([
    { track: "jp" as const, readings: ["がっこう", "がくこう", "がっこ", "せんせい", "だいがく"], near: ["がくこう", "がっこ"] },
    { track: "cn" as const, readings: ["xué xiào", "xué shēng", "xué xí", "gōng zuò", "shí jiān"], near: ["xué xí", "xué shēng"] },
  ])("builds distinct same-track $track compound distractors", ({ track, readings, near }) => {
    const words = readings.map((reading, index) => word(index + 1, reading, [1, 2], track));
    const item = buildWordItem(words[0], [...words, word(99, "학교")], characters[0], 0, random(1));

    expect(item?.track).toBe(track);
    expect(item?.options).toHaveLength(4);
    expect(new Set(item?.options.map((option) => option.label)).size).toBe(4);
    expect(item?.options.every((option) => readings.includes(option.label))).toBe(true);
    expect(item?.options.slice(1, 3).map((option) => option.label)).toEqual(near);
  });

  it.each(["lesson", "review"] as const)("adds eligible Japanese and Chinese word cards in %s", (mode) => {
    const now = new Date("2026-01-02T00:00:00Z");
    const due = { ...initialState(now), due: new Date("2026-01-01T00:00:00Z"), correctCount: 1 };
    for (const track of ["jp", "cn"] as const) {
      const states = new Map(characters.map((item) => [reviewKey(item.id, track), due]));
      const readings = track === "jp" ? ["がっこう", "がくせい", "にほん", "じかん"] : ["xué xiào", "xué shēng", "zhōng guó", "shí jiān"];
      const words = readings.map((reading, index) => word(index + 1, reading, [index * 2 + 1, index * 2 + 2], track));
      const queue = buildQueue({ characters, enabledTracks: [track], length: 4, mode, reviewStates: states, now, words });

      expect(queue.filter((item) => item.kind !== "word")).toHaveLength(4);
      expect(queue.filter((item) => item.kind === "word")).toHaveLength(1);
      expect(queue.find((item) => item.kind === "word")?.track).toBe(track);
    }
  });

  it("adds only eligible minority word cards without replacing due reviews", () => {
    const now = new Date("2026-01-02T00:00:00Z");
    const due = { ...initialState(now), due: new Date("2026-01-01T00:00:00Z"), correctCount: 1 };
    const states = new Map(characters.map((item) => [reviewKey(item.id, "kr"), due]));
    const words = [word(1, "학교", [1, 2]), word(2, "부모", [3, 4]), word(3, "시간", [5, 6]), word(4, "정답", [7, 8])];
    const queue = buildQueue({ characters, enabledTracks: ["kr"], length: 8, mode: "review", reviewStates: states, now, words });

    expect(queue.filter((item) => item.kind !== "word")).toHaveLength(8);
    expect(queue.filter((item) => item.kind === "word")).toHaveLength(2);
    expect(queue.filter((item) => item.kind === "word").length).toBeLessThan(queue.filter((item) => item.kind !== "word").length);
  });

  it("does not issue a word until every constituent has review state", () => {
    const known = initialState(new Date());
    const words = [word(1, "학교"), word(2, "부모"), word(3, "시간"), word(4, "정답")];
    const queue = buildQueue({ characters, enabledTracks: ["kr"], length: 4, mode: "lesson", reviewStates: new Map([[reviewKey(1, "kr"), known]]), words });

    expect(queue.every((item) => item.kind !== "word")).toBe(true);
  });

  it("builds two separated deterministic unit-test rounds with harder repeats", () => {
    const corpus = ["장인 공", "빌 공", "강 강", "글월 문", "물을 문", "물 수", "불 화", "일 사", "넉 사", "윗 상"].map((reading, index) => withKorean(index + 1, reading));
    const targets = corpus.slice(0, 3);
    const build = (seed: number) => buildUnitTestQueue({ targets, characters: corpus, track: "kr", random: random(seed) });
    const queue = build(7);

    expect(queue).toHaveLength(targets.length * 2);
    expect(queue.slice(0, targets.length).map((item) => item.character.id).sort()).toEqual(targets.map((item) => item.id));
    expect(queue.slice(targets.length).map((item) => item.character.id).sort()).toEqual(targets.map((item) => item.id));
    expect(queue.every((item, index) => index === 0 || item.character.id !== queue[index - 1].character.id)).toBe(true);
    expect(build(7)).toEqual(queue);
    expect(build(8).map((item) => item.character.id)).not.toEqual(queue.map((item) => item.character.id));

    for (const target of targets) {
      const [first, second] = queue.filter((item) => item.character.id === target.id);
      const wrong = (item: typeof first) => item.options.filter((_, index) => index !== item.answerIndex).map((option) => option.label);
      expect(first.options).toHaveLength(4);
      expect(new Set(first.options.map((option) => option.label)).size).toBe(4);
      expect(wrong(second).filter((label) => wrong(first).includes(label))).toHaveLength(0);
      expect(second.answerIndex).not.toBe(first.answerIndex);
    }
    expect(queue.flatMap((item) => item.options.map((option) => option.label)).some((label) => !targets.some((target) => target.tracks.some((entry) => entry.track === "kr" && entry.reading === label)))).toBe(true);
  });

  it("uses partial new distractors before reusing prior choices", () => {
    const corpus = ["장인 공", "빌 공", "강 강", "글월 문", "물 수", "불 화"].map((reading, index) => withKorean(index + 1, reading));
    const targets = corpus.slice(0, 2);
    const queue = buildUnitTestQueue({ targets, characters: corpus, track: "kr", random: random(4) });

    for (const target of targets) {
      const [first, second] = queue.filter((item) => item.character.id === target.id);
      const wrong = (item: typeof first) => item.options.filter((_, index) => index !== item.answerIndex).map((option) => option.label);
      const unused = corpus.flatMap((item) => item.tracks.filter((entry) => entry.track === "kr").map((entry) => entry.reading))
        .filter((label) => label !== target.tracks.find((entry) => entry.track === "kr")?.reading && !wrong(first).includes(label));
      expect(unused).toHaveLength(2);
      expect(wrong(second)).toEqual(expect.arrayContaining(unused));
      expect(wrong(second).filter((label) => wrong(first).includes(label))).toHaveLength(1);
    }
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
        const meaning = buildMeaningItem(item, entry.track, corpus, item.id, random(item.id));
        expect(meaning, `${item.key}:${entry.track} meaning`).toBeDefined();
        expect(new Set(meaning?.options.map((option) => option.label)).size, `${item.key}:${entry.track} meaning`).toBe(4);
        if (entry.track === "jp" && entry.kun !== "なし") {
          const kun = buildKunItem(item, corpus, item.id, random(item.id));
          expect(kun, `${item.key}:jp kun`).toBeDefined();
          expect(new Set(kun?.options.map((option) => option.label)).size, `${item.key}:jp kun`).toBe(4);
          expect(kun?.options.some((option) => option.label === "なし")).toBe(false);
        }
      }
    }
  });
});
