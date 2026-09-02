import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { sentenceAttribution } from "../src/shared/sentenceAttribution.ts";
import { createPlacementState, isPlacementComplete, nextPlacementItem, placementResults, recordPlacementAnswer } from "../src/features/placement/adaptive.ts";
import { emitSeedSql, emitSentenceSeedSql, emitWordSeedSql, parseSeed, parseSentenceSeed, parseWordSeed } from "./seed.ts";
import { tierForTgh } from "./tgh-tier.ts";
import { buildAudioEntries } from "./generate-audio.ts";
import type { CharacterEntry, SeedSentenceEntry, Track } from "../src/shared/types.ts";

const files = {
  "data/characters/kr-8geup.json": 50,
  "data/characters/kr-7geup.json": 100,
  "data/characters/kr-6geup2.json": 75,
  "data/characters/kr-6geup.json": 75,
  "data/characters/kr-5geup2.json": 100,
  "data/characters/kr-5geup.json": 100,
  "data/characters/kr-4geup2.json": 250,
  "data/characters/kr-4geup.json": 250,
  "data/characters/jp-jlpt-n5.json": 79,
  "data/characters/jp-jlpt-n4.json": 166,
  "data/characters/jp-jlpt-n3.json": 367,
  "data/characters/jp-jlpt-n2.json": 367,
  "data/characters/jp-jlpt-n1.json": 1232,
  "data/characters/cn-hsk1.json": 246,
  "data/characters/cn-hsk2.json": 220,
  "data/characters/cn-hsk3.json": 284,
};

test("curated character files validate and cross-link", async () => {
  const linked = new Map<string, Set<Track>>();
  for (const [path, expectedCount] of Object.entries(files)) {
    const document = parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown);
    assert.equal(document.characters.length, expectedCount, path);
    assert.ok(document.curriculumUnits?.every((unit) => unit.members.length >= 8 && unit.members.length <= 12), path);

    for (const character of document.characters) {
      const tracks = linked.get(character.key) ?? new Set<Track>();
      for (const entry of character.tracks) {
        tracks.add(entry.track);
        if (entry.track === "jp") {
          assert.match(entry.on, /^(?:[\p{Script=Katakana}ー・-]+|なし)$/u, `${path}: ${character.key} on`);
          assert.match(entry.kun, /^(?:[\p{Script=Hiragana}\p{Script=Katakana}ー・-]+|なし)$/u, `${path}: ${character.key} kun`);
        }
        if (entry.track === "cn") assert.doesNotMatch(entry.pinyin, /\d/u, `${path}: ${character.key} pinyin`);
      }
      linked.set(character.key, tracks);
    }
  }

  assert.ok([...linked.values()].filter((tracks) => tracks.size >= 2).length >= 30);
});

test("cached audio generation covers every unique character reading", async () => {
  const paths = Object.keys(files);
  const documents = await Promise.all(paths.map(async (path) => parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown)));
  const entries = buildAudioEntries(documents);
  assert.equal(entries.length, 3866);
  assert.deepEqual(Object.fromEntries(["kr", "jp", "cn"].map((track) => [track, entries.filter((entry) => entry.track === track).length])), {
    kr: 1000,
    jp: 2211,
    cn: 655,
  });
  assert.equal(new Set(entries.map((entry) => entry.objectKey)).size, entries.length);
  assert.ok(entries.filter((entry) => entry.track === "jp").every((entry) => (
    entry.text.length > 0 && entry.text.split("、").every((reading) => reading !== "なし")
  )), "no synthesized on/kun field is the なし sentinel");
  assert.deepEqual(entries.find((entry) => entry.objectKey === "kr/校.mp3"), { key: "校", objectKey: "kr/校.mp3", text: "학교 교", track: "kr" });
  assert.deepEqual(entries.find((entry) => entry.objectKey === "jp/一.mp3"), { key: "一", objectKey: "jp/一.mp3", text: "イチ・イツ、ひと-・ひと-つ", track: "jp" });
  assert.equal(entries.find((entry) => entry.objectKey === "jp/電.mp3")?.text, "デン", "on-only reading");
  assert.equal(entries.find((entry) => entry.objectKey === "jp/込.mp3")?.text, "-こ-む・こ-む・こ-み・-こ-み・こ-める", "kun-only reading");
});

test("Japanese JLPT curriculum, Kanken metadata, and variants match the pinned sources", async () => {
  const scale = [
    { path: "data/characters/jp-jlpt-n5.json", level: "N5", levelOrd: 1, added: 79 },
    { path: "data/characters/jp-jlpt-n4.json", level: "N4", levelOrd: 2, added: 166 },
    { path: "data/characters/jp-jlpt-n3.json", level: "N3", levelOrd: 3, added: 367 },
    { path: "data/characters/jp-jlpt-n2.json", level: "N2", levelOrd: 4, added: 367 },
    { path: "data/characters/jp-jlpt-n1.json", level: "N1", levelOrd: 5, added: 1232 },
  ];
  const allPaths = Object.keys(files);
  const documents = await Promise.all(allPaths.map(async (path) => parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown)));
  const byPath = new Map(allPaths.map((path, index) => [path, documents[index]]));
  for (const expected of scale) {
    const document = byPath.get(expected.path)!;
    const characters = document.characters;
    assert.equal(characters.length, expected.added, expected.level);
    assert.ok(characters.every((character) => character.tracks.some((track) => track.track === "jp" && track.jlpt === expected.level && track.levelOrd === expected.levelOrd)), expected.level);
    const members = document.curriculumUnits?.flatMap((unit) => unit.members.map((member) => member.key)) ?? [];
    assert.deepEqual(new Set(members), new Set(characters.map((character) => character.key)), `${expected.level} coverage`);
    assert.equal(new Set(members).size, members.length, `${expected.level} duplicate member`);
    assert.ok(document.curriculumUnits?.every((unit) => unit.track === "jp" && unit.level === expected.level && unit.members.length >= 8 && unit.members.length <= 10));
  }

  const japanese = scale.flatMap((expected) => byPath.get(expected.path)!.characters);
  assert.equal(new Set(japanese.map((character) => character.key)).size, 2211);
  assert.equal(createHash("sha256").update(japanese.map((character) => {
    const entry = character.tracks.find((track) => track.track === "jp")!;
    return `${entry.glyph}:${entry.jlpt}`;
  }).sort().join("\n")).digest("hex"), "40a3d0786b8ec0960fe7c917ffae564a4b603fd9ed5678be86c7eb09bbf39f13");
  assert.ok(japanese.every((character) => character.tracks.some((track) => track.track === "jp" && track.kanken.length > 0)));
  const canonicalStrokes = new Map([
    ["轉", 18], ["乘", 10], ["驛", 23], ["硏", 11], ["兩", 8],
    ["橫", 16], ["豫", 16], ["齒", 15], ["縣", 16],
  ]);
  for (const character of japanese) {
    const expected = canonicalStrokes.get(character.key);
    if (expected) assert.equal(character.strokeCount, expected, `${character.key} canonical strokes`);
  }

  const otherCharacters = documents.flatMap((document) => document.characters).filter((character) => !japanese.includes(character));
  for (const character of japanese) {
    for (const matching of otherCharacters.filter((candidate) => candidate.key === character.key)) {
      assert.deepEqual(matching.variants, character.variants, `${character.key} complete variants`);
    }
  }
});

test("seeded Japanese placement bounds and all-correct estimate reach N1", async () => {
  const jpPaths = Object.keys(files).filter((path) => path.includes("/jp-"));
  let id = 0;
  const characters: CharacterEntry[] = (await Promise.all(jpPaths.map(async (path) => parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown))))
    .flatMap((document) => document.characters)
    .map((character) => {
      id += 1;
      return { ...character, id, createdAt: 0, sentences: [], tracks: character.tracks.map((track) => ({ ...track, characterId: id })) };
    });
  let state = createPlacementState(characters, ["jp"]);
  assert.deepEqual({ min: state.estimates.jp.minLevelOrd, max: state.estimates.jp.maxLevelOrd }, { min: 1, max: 5 });
  while (!isPlacementComplete(state)) {
    const item = nextPlacementItem(state, characters);
    assert.ok(item);
    state = recordPlacementAnswer(state, item, true);
  }
  assert.equal(placementResults(state)[0].levelOrd, 5);
});

test("Chinese source counts, HSK 3 membership, units, and variants match the pinned sources", async () => {
  assert.deepEqual(["2013:3500", "2013:3501", "2013:6500", "2013:6501", "2013:8105"].map(tierForTgh), ["一级字", "二级字", "二级字", "三级字", "三级字"]);
  for (const invalid of [undefined, "2013:0", "2013:8106", "3379", "2013:abc"]) assert.throws(() => tierForTgh(invalid), /invalid kTGH position/u);
  const cnPaths = ["data/characters/cn-hsk1.json", "data/characters/cn-hsk2.json", "data/characters/cn-hsk3.json"];
  assert.equal(
    createHash("sha256").update(await readFile(cnPaths[2])).digest("hex"),
    "0a9f572f5d8eebb5de395afeca27c2322371671ec146f00500dcd48b1230801b",
    "re-run the Chinese and Japanese generators when the frozen output changes",
  );
  assert.equal(
    createHash("sha256").update(await readFile("data/sentences/cn-hsk3.json")).digest("hex"),
    "7802410f35fb70d200a9ea0abaadfca869ec23897c09e00ec4b99069a20fcf45",
    "re-run generate-cn-through-hsk3.mjs when the frozen output changes",
  );
  const documents = await Promise.all(Object.keys(files).map(async (path) => parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown)));
  const byPath = new Map(Object.keys(files).map((path, index) => [path, documents[index]]));
  const [hsk1, hsk2, hsk3] = cnPaths.map((path) => byPath.get(path)!);
  const glyphs = (document: typeof hsk1) => document.characters.map((character) => character.tracks.find((track) => track.track === "cn")!.glyph);
  const [hsk1Glyphs, hsk2Glyphs, hsk3Glyphs] = [hsk1, hsk2, hsk3].map(glyphs);

  assert.deepEqual([hsk1.characters.length, hsk2.characters.length, hsk3.characters.length], [246, 220, 284]);
  assert.equal(hsk2Glyphs.filter((glyph) => hsk1Glyphs.includes(glyph)).length, 95);
  assert.equal(hsk3Glyphs.filter((glyph) => hsk1Glyphs.includes(glyph) || hsk2Glyphs.includes(glyph)).length, 0);
  assert.equal(new Set([...hsk1Glyphs, ...hsk2Glyphs, ...hsk3Glyphs]).size, 655);
  assert.equal(
    createHash("sha256").update(hsk3Glyphs.toSorted().join("")).digest("hex"),
    "d57f93e9d888ec3e5f4a77fb0b5ba3d079adefa93bcba572f166d75ca95d1ca5",
  );

  const members = hsk3.curriculumUnits?.flatMap((unit) => unit.members.map((member) => member.key)) ?? [];
  assert.equal(members.length, 284);
  assert.deepEqual(new Set(members), new Set(hsk3.characters.map((character) => character.key)));
  assert.equal(new Set(members).size, members.length);
  assert.ok(hsk3.curriculumUnits?.every((unit) => unit.track === "cn" && unit.level === "HSK 3" && unit.members.length >= 8 && unit.members.length <= 10));
  assert.ok(hsk3.characters.every((character) => character.tracks.some((track) => (
    track.track === "cn" && track.hsk === "HSK 3" && track.levelOrd === 3 && track.tier === "一级字"
  ))));
  assert.equal(
    hsk3.characters.find((character) => character.tracks[0].glyph === "激")!.tracks.find((track) => track.track === "cn")!.tier,
    tierForTgh("2013:3379"),
  );
  const canonicalSpotChecks = new Map([
    ["黄", { key: "黃", variants: { jp: "黄", kr: "黃", cn: "黄" }, strokeCount: 12, pinyin: "huáng" }],
    ["礼", { key: "禮", variants: { kr: "禮", jp: "礼", cn: "礼" }, strokeCount: 17, pinyin: "lǐ" }],
    ["银", { key: "銀", variants: { kr: "銀", jp: "銀", cn: "银" }, strokeCount: 14, pinyin: "yín" }],
    ["发", { key: "发", variants: { cn: "发" }, strokeCount: 5, pinyin: "fā" }],
    ["历", { key: "历", variants: { cn: "历" }, strokeCount: 4, pinyin: "lì" }],
  ]);
  for (const [glyph, expected] of canonicalSpotChecks) {
    const character = hsk3.characters.find((candidate) => candidate.tracks[0].glyph === glyph)!;
    const track = character.tracks.find((candidate) => candidate.track === "cn")!;
    assert.deepEqual({ key: character.key, variants: character.variants, strokeCount: character.strokeCount, pinyin: track.pinyin }, expected);
  }

  const completeVariants = new Map<string, Partial<Record<Track, string>>>();
  for (const character of documents.flatMap((document) => document.characters)) {
    completeVariants.set(character.key, { ...(completeVariants.get(character.key) ?? {}), ...character.variants });
  }
  for (const character of hsk3.characters) {
    assert.deepEqual(character.variants, completeVariants.get(character.key), `${character.key} complete variants`);
    for (const matching of documents.flatMap((document) => document.characters).filter((candidate) => candidate.key === character.key)) {
      assert.deepEqual(matching.variants, character.variants, `${character.key} cross-file variants`);
    }
  }

  const sources = await readFile("data/SOURCES.md", "utf8");
  for (const count of ["246 membership rows", "225 membership rows", "434 membership rows", "655"]) assert.ok(sources.includes(count), count);
});

test("seeded Chinese placement bounds and all-correct estimate reach HSK 3", async () => {
  const cnPaths = Object.keys(files).filter((path) => path.includes("/cn-"));
  let id = 0;
  const characters: CharacterEntry[] = (await Promise.all(cnPaths.map(async (path) => parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown))))
    .flatMap((document) => document.characters)
    .map((character) => {
      id += 1;
      return { ...character, id, createdAt: 0, sentences: [], tracks: character.tracks.map((track) => ({ ...track, characterId: id })) };
    });
  let state = createPlacementState(characters, ["cn"]);
  assert.deepEqual({ min: state.estimates.cn.minLevelOrd, max: state.estimates.cn.maxLevelOrd }, { min: 1, max: 3 });
  while (!isPlacementComplete(state)) {
    const item = nextPlacementItem(state, characters);
    assert.ok(item);
    state = recordPlacementAnswer(state, item, true);
  }
  assert.equal(placementResults(state)[0].levelOrd, 3);
});

test("Korean grade deltas, cumulative totals, ordinals, and curriculum coverage match the official scale", async () => {
  const scale = [
    { level: "8급", levelOrd: 1, added: 50, cumulative: 50 },
    { level: "7급II", levelOrd: 2, added: 50, cumulative: 100 },
    { level: "7급", levelOrd: 3, added: 50, cumulative: 150 },
    { level: "6급II", levelOrd: 4, added: 75, cumulative: 225 },
    { level: "6급", levelOrd: 5, added: 75, cumulative: 300 },
    { level: "5급II", levelOrd: 6, added: 100, cumulative: 400 },
    { level: "5급", levelOrd: 7, added: 100, cumulative: 500 },
    { level: "4급II", levelOrd: 8, added: 250, cumulative: 750 },
    { level: "4급", levelOrd: 9, added: 250, cumulative: 1000 },
  ];
  const krPaths = Object.keys(files).filter((path) => path.includes("/kr-"));
  const allPaths = Object.keys(files);
  const documents = await Promise.all(allPaths.map(async (path) => parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown)));
  const byPath = new Map(allPaths.map((path, index) => [path, documents[index]]));
  const characters = krPaths.flatMap((path) => byPath.get(path)!.characters);
  assert.equal(new Set(characters.map((character) => character.key)).size, 1000);

  for (const [path, expectedHash] of [
    ["data/characters/kr-4geup2.json", "f6a6e2c58d36aa03cb1ed8e615f9553f7a79cead2976e5dac823f51b35683ebb"],
    ["data/characters/kr-4geup.json", "114300f1063a099a014d70a8ab38122f430ca3f9a52e49871f2a565aa97eefe0"],
    ["data/sentences/kr-4geup2.json", "bf909ff25b00f0571ac12208caed49515a0fb185f34020713360ef2fced5aabb"],
    ["data/sentences/kr-4geup.json", "56ac5fa261114e2da2915818c52a16e5fe37cae2e26398b6c30eb2e173a18c06"],
  ] as const) {
    assert.equal(
      createHash("sha256").update(await readFile(path)).digest("hex"),
      expectedHash,
      "re-run the Korean and Japanese generators when the frozen output changes",
    );
  }

  for (const [path, expectedHash] of [
    ["data/characters/kr-4geup2.json", "fd169e3bb781c9aa6cfeb6893d06cf0404afb3b5a4738c82c02a5c56666b2a18"],
    ["data/characters/kr-4geup.json", "bfcb679634056844394a40c234cd281b64ab3e9fed2f60ed127c627f812ec336"],
  ] as const) {
    const glyphs = byPath.get(path)!.characters.map((character) => character.tracks.find((track) => track.track === "kr")!.glyph);
    assert.equal(createHash("sha256").update(glyphs.toSorted().join("")).digest("hex"), expectedHash, path);
  }

  const completeVariants = new Map<string, Partial<Record<Track, string>>>();
  for (const character of documents.flatMap((document) => document.characters)) {
    completeVariants.set(character.key, { ...(completeVariants.get(character.key) ?? {}), ...character.variants });
  }
  for (const character of characters) {
    const expected = completeVariants.get(character.key)!;
    for (const track of ["jp", "cn"] as const) {
      if (expected[track]) assert.equal(character.variants[track], expected[track], `${character.key} ${track} variant`);
    }
  }

  let cumulative = 0;
  for (const expected of scale) {
    const entries = characters.filter((character) => character.tracks.some((track) => track.track === "kr" && track.level === expected.level));
    assert.equal(entries.length, expected.added, expected.level);
    assert.ok(entries.every((character) => character.tracks.some((track) => track.track === "kr" && track.levelOrd === expected.levelOrd)), expected.level);
    cumulative += entries.length;
    assert.equal(cumulative, expected.cumulative, `${expected.level} cumulative`);
  }

  for (const path of krPaths.filter((candidate) => !candidate.endsWith("kr-8geup.json") && !candidate.endsWith("kr-7geup.json"))) {
    const document = parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown);
    const characterKeys = new Set(document.characters.map((character) => character.key));
    const members = document.curriculumUnits?.flatMap((unit) => unit.members.map((member) => member.key)) ?? [];
    assert.equal(members.length, characterKeys.size, `${path} member count`);
    assert.deepEqual(new Set(members), characterKeys, `${path} curriculum coverage`);
    assert.equal(new Set(members).size, members.length, `${path} duplicate curriculum member`);
    const level = document.characters[0].tracks.find((track) => track.track === "kr")!.level;
    assert.ok(document.curriculumUnits?.every((unit) => unit.level === level), `${path} unit level`);
  }
});

test("seeded Korean placement bounds and all-correct estimate reach 4급", async () => {
  const krPaths = Object.keys(files).filter((path) => path.includes("/kr-"));
  let id = 0;
  const characters: CharacterEntry[] = (await Promise.all(krPaths.map(async (path) => parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown))))
    .flatMap((document) => document.characters)
    .map((character) => {
      id += 1;
      return {
        ...character,
        id,
        createdAt: 0,
        sentences: [],
        tracks: character.tracks.map((track) => ({ ...track, characterId: id })),
      };
    });
  let state = createPlacementState(characters, ["kr"]);
  assert.deepEqual({ min: state.estimates.kr.minLevelOrd, max: state.estimates.kr.maxLevelOrd }, { min: 1, max: 9 });
  while (!isPlacementComplete(state)) {
    const item = nextPlacementItem(state, characters);
    assert.ok(item);
    state = recordPlacementAnswer(state, item, true);
  }
  assert.equal(placementResults(state)[0].levelOrd, 9);
});

test("sourced sentence files resolve to their exact target glyph", async () => {
  const glyphs = new Map<string, string>();
  const trackCounts = new Map<string, Set<Track>>();
  const legacyTrackCounts = new Map<string, Set<Track>>();
  const legacyKrKeys = new Set((await Promise.all(["data/characters/kr-8geup.json", "data/characters/kr-7geup.json"].map(async (path) => (
    parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown).characters.map((character) => character.key)
  )))).flat());
  for (const path of Object.keys(files)) {
    for (const character of parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown).characters) {
      const tracks = trackCounts.get(character.key) ?? new Set<Track>();
      for (const entry of character.tracks) {
        glyphs.set(`${character.key}:${entry.track}`, entry.glyph);
        tracks.add(entry.track);
        if (path !== "data/characters/cn-hsk3.json" && (entry.track !== "jp" || entry.kanken === "10級" || entry.kanken === "9級")) {
          const legacyTracks = legacyTrackCounts.get(character.key) ?? new Set<Track>();
          legacyTracks.add(entry.track);
          legacyTrackCounts.set(character.key, legacyTracks);
        }
      }
      trackCounts.set(character.key, tracks);
    }
  }

  const byIdentity = new Map<string, SeedSentenceEntry>();
  for (const name of await readdir("data/sentences")) {
    if (!name.endsWith(".json")) continue;
    const sentencePath = `data/sentences/${name}`;
    const document = parseSentenceSeed(JSON.parse(await readFile(sentencePath, "utf8")) as unknown);
    for (const entry of document.sentences) {
      const glyph = glyphs.get(`${entry.characterKey}:${entry.track}`);
      assert.ok(glyph, `${sentencePath}: unknown ${entry.characterKey}:${entry.track}`);
      assert.equal(Array.from(entry.text)[entry.targetIndex], glyph, `${sentencePath}: ${entry.characterKey}`);
      assert.equal(entry.text.codePointAt(entry.targetIndex), glyph.codePointAt(0), `${sentencePath}: ${entry.characterKey} code point`);
      assert.match(entry.source, /^(?:Tatoeba|개역간이국한문한글판|대한민국헌법|노동야학독본|국민 소학 독본|산중신곡|3·1독립선언서|군정법령 제\d+호) #\d+$/u, `${sentencePath}: ${entry.characterKey}`);
      assert.ok(sentenceAttribution(entry.source), `${sentencePath}: ${entry.characterKey} attribution`);
      if (entry.track === "kr") {
        assert.equal(entry.reading, null, `${sentencePath}: ${entry.characterKey} reading`);
        assert.match(entry.text, /\p{Script=Hangul}/u, `${sentencePath}: ${entry.characterKey} Hangul`);
        assert.ok(entry.text.includes(glyph), `${sentencePath}: ${entry.characterKey} Hanja`);
        assert.equal(entry.sourceKind, entry.source.includes("독본") ? "textbook" : "corpus", `${sentencePath}: ${entry.characterKey} source kind`);
      } else {
        assert.ok(entry.reading, `${sentencePath}: ${entry.characterKey} reading`);
        if (entry.track === "jp") assert.doesNotMatch(entry.reading, /[\p{Script=Han}\p{Script=Katakana}\p{Number}]/u, `${sentencePath}: ${entry.characterKey} hiragana`);
        else {
          assert.doesNotMatch(entry.reading, /\p{Number}/u, `${sentencePath}: ${entry.characterKey} full pinyin`);
          assert.match(entry.reading, /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/u, `${sentencePath}: ${entry.characterKey} tone mark`);
        }
      }
      const identity = `${entry.characterKey}:${entry.track}:${entry.rank}`;
      const existing = byIdentity.get(identity);
      if (existing) assert.deepEqual(entry, existing, `${sentencePath}: conflicting duplicate ${identity}`);
      byIdentity.set(identity, entry);
    }
  }

  const krCovered = [...byIdentity.values()].filter((entry) => entry.track === "kr");
  assert.equal(krCovered.length, 289);
  assert.equal(new Set(krCovered.map((entry) => entry.characterKey)).size, 289);
  assert.equal(byIdentity.size, 1001);
  assert.ok([...glyphs].filter(([identity]) => !byIdentity.has(`${identity}:0`)).length > 1093);
  for (const [key, tracks] of trackCounts) {
    if (tracks.size === 3 && legacyTrackCounts.get(key)?.size === 3) {
      const sentences = [...byIdentity.values()].filter((entry) => entry.characterKey === key);
      assert.ok(sentences.length >= 1, key);
      if (legacyKrKeys.has(key) || byIdentity.has(`${key}:kr:0`)) assert.ok(sentences.length >= 2, key);
    }
  }
});

test("Korean sentence gap ledger names every uncovered character exactly once", async () => {
  const krPaths = Object.keys(files).filter((path) => path.includes("/kr-"));
  const characterKeys = (await Promise.all(krPaths.map(async (path) => parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown))))
    .flatMap((document) => document.characters.map((character) => character.key));
  const coveredKeys = new Set((await Promise.all(krPaths.map(async (path) => parseSentenceSeed(JSON.parse(await readFile(path.replace("/characters/", "/sentences/"), "utf8")) as unknown))))
    .flatMap((document) => document.sentences.map((sentence) => sentence.characterKey)));
  const expected = characterKeys.filter((key) => !coveredKeys.has(key)).sort();
  const sources = await readFile("data/SOURCES.md", "utf8");
  const gapSection = sources.slice(sources.indexOf("### Remaining Korean gaps"), sources.indexOf("## Past-paper sourcing position"));
  const documented = [...gapSection.matchAll(/^\| ([^|]+) \|/gmu)]
    .map((match) => match[1].trim())
    .filter((key) => key !== "Character" && key !== "---")
    .sort();

  assert.deepEqual(documented, expected);
});

test("Korean compounds are sourced and contain only seeded grade members", async () => {
  const krPaths = Object.keys(files).filter((path) => path.includes("/kr-"));
  const characters = (await Promise.all(krPaths.map(async (path) => parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown))))
    .flatMap((document) => document.characters)
    .map((character) => ({ character, track: character.tracks.find((entry) => entry.track === "kr")! }));
  const byKey = new Map(characters.map((entry) => [entry.character.key, entry]));
  const document = parseWordSeed(JSON.parse(await readFile("data/words/kr-wiktionary.json", "utf8")) as unknown);
  const sources = await readFile("data/SOURCES.md", "utf8");

  assert.equal(document.words.length, 28);
  assert.deepEqual([...new Set(document.words.map((word) => word.levelOrd))], [1, 2, 3, 4, 5, 6, 7]);
  for (let levelOrd = 1; levelOrd <= 7; levelOrd += 1) assert.equal(document.words.filter((word) => word.levelOrd === levelOrd).length, 4);
  for (const word of document.words) {
    assert.match(word.glyph, /^\p{Script=Han}{2}$/u, word.glyph);
    assert.match(word.reading, /^\p{Script=Hangul}{2}$/u, word.reading);
    const members = word.members.map((key) => byKey.get(key));
    assert.ok(members.every(Boolean), `${word.glyph}: unseeded member`);
    assert.equal(word.glyph, members.map((member) => member!.track.glyph).join(""), word.glyph);
    assert.equal(word.levelOrd, Math.max(...members.map((member) => member!.track.levelOrd)), `${word.glyph}: highest grade`);
    assert.ok(sources.includes(word.sourceUrl), `${word.glyph}: source ledger`);
  }

  const sqlite = new DatabaseSync(":memory:");
  try {
    for (const migration of ["0001_init.sql", "0002_fsrs.sql", "0003_sessions.sql", "0010_words.sql", "0015_curriculum_unit_level_ord.sql"]) sqlite.exec(await readFile(`migrations/${migration}`, "utf8"));
    for (const path of Object.keys(files)) sqlite.exec(emitSeedSql(parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown)));
    const sql = emitWordSeedSql(document);
    sqlite.exec(sql);
    sqlite.exec(sql);
    const counts = sqlite.prepare("SELECT (SELECT COUNT(*) FROM words) AS words, (SELECT COUNT(*) FROM word_members) AS members").get();
    assert.equal(counts?.words, 28);
    assert.equal(counts?.members, 56);
  } finally {
    sqlite.close();
  }
});

test("full content seed loads cleanly and is idempotent", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(await readFile("migrations/0001_init.sql", "utf8"));
    sqlite.exec(await readFile("migrations/0013_sentence_readings.sql", "utf8"));
    sqlite.exec(await readFile("migrations/0015_curriculum_unit_level_ord.sql", "utf8"));
    const characterSql = await Promise.all(Object.keys(files).map(async (path) => (
      emitSeedSql(parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown))
    )));
    const sentenceSql = await Promise.all((await readdir("data/sentences")).filter((name) => name.endsWith(".json")).map(async (name) => (
      emitSentenceSeedSql(parseSentenceSeed(JSON.parse(await readFile(`data/sentences/${name}`, "utf8")) as unknown))
    )));
    const sql = [...characterSql, ...sentenceSql].join("\n");
    sqlite.exec(sql);
    const counts = sqlite.prepare("SELECT (SELECT COUNT(*) FROM characters) AS characters, (SELECT COUNT(*) FROM character_tracks) AS tracks, (SELECT COUNT(*) FROM example_sentences) AS sentences").get();
    sqlite.exec(sql);
    assert.deepEqual(sqlite.prepare("SELECT (SELECT COUNT(*) FROM characters) AS characters, (SELECT COUNT(*) FROM character_tracks) AS tracks, (SELECT COUNT(*) FROM example_sentences) AS sentences").get(), counts);
    assert.equal(counts?.sentences, 1001);
  } finally {
    sqlite.close();
  }
});

test("sentence attribution links source revisions and licenses", () => {
  assert.deepEqual(sentenceAttribution("Tatoeba #907715"), {
    sourceUrl: "https://tatoeba.org/sentences/show/907715",
    license: "CC BY 2.0 FR",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/fr/",
  });
  assert.deepEqual(sentenceAttribution("대한민국헌법 #418801"), {
    sourceUrl: "https://ko.wikisource.org/w/index.php?oldid=418801",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  });
  assert.equal(sentenceAttribution("알 수 없는 출처 #123"), null);
});
