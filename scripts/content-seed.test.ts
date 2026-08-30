import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { sentenceAttribution } from "../src/shared/sentenceAttribution.ts";
import { createPlacementState, isPlacementComplete, nextPlacementItem, placementResults, recordPlacementAnswer } from "../src/features/placement/adaptive.ts";
import { emitSeedSql, emitSentenceSeedSql, parseSeed, parseSentenceSeed } from "./seed.ts";
import type { CharacterEntry, SeedSentenceEntry, Track } from "../src/shared/types.ts";

const files = {
  "data/characters/kr-8geup.json": 50,
  "data/characters/kr-7geup.json": 100,
  "data/characters/kr-6geup2.json": 75,
  "data/characters/kr-6geup.json": 75,
  "data/characters/kr-5geup2.json": 100,
  "data/characters/kr-5geup.json": 100,
  "data/characters/jp-kanken-10.json": 80,
  "data/characters/jp-kanken-9.json": 160,
  "data/characters/cn-hsk1.json": 246,
  "data/characters/cn-hsk2.json": 220,
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
          assert.match(entry.on, /^[\p{Script=Katakana}ー・-]+$/u, `${path}: ${character.key} on`);
          assert.match(entry.kun, /^[\p{Script=Hiragana}ー・-]+$/u, `${path}: ${character.key} kun`);
        }
        if (entry.track === "cn") assert.doesNotMatch(entry.pinyin, /\d/u, `${path}: ${character.key} pinyin`);
      }
      linked.set(character.key, tracks);
    }
  }

  assert.ok([...linked.values()].filter((tracks) => tracks.size >= 2).length >= 30);
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
  ];
  const krPaths = Object.keys(files).filter((path) => path.includes("/kr-"));
  const allPaths = Object.keys(files);
  const documents = await Promise.all(allPaths.map(async (path) => parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown)));
  const byPath = new Map(allPaths.map((path, index) => [path, documents[index]]));
  const characters = krPaths.flatMap((path) => byPath.get(path)!.characters);
  assert.equal(new Set(characters.map((character) => character.key)).size, 500);

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

test("seeded Korean placement bounds and all-correct estimate reach 5급", async () => {
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
  assert.deepEqual({ min: state.estimates.kr.minLevelOrd, max: state.estimates.kr.maxLevelOrd }, { min: 1, max: 7 });
  while (!isPlacementComplete(state)) {
    const item = nextPlacementItem(state, characters);
    assert.ok(item);
    state = recordPlacementAnswer(state, item, true);
  }
  assert.equal(placementResults(state)[0].levelOrd, 7);
});

test("sourced sentence files resolve to their exact target glyph", async () => {
  const glyphs = new Map<string, string>();
  const trackCounts = new Map<string, Set<Track>>();
  const legacyKrKeys = new Set((await Promise.all(["data/characters/kr-8geup.json", "data/characters/kr-7geup.json"].map(async (path) => (
    parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown).characters.map((character) => character.key)
  )))).flat());
  for (const path of Object.keys(files)) {
    for (const character of parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown).characters) {
      const tracks = trackCounts.get(character.key) ?? new Set<Track>();
      for (const entry of character.tracks) {
        glyphs.set(`${character.key}:${entry.track}`, entry.glyph);
        tracks.add(entry.track);
      }
      trackCounts.set(character.key, tracks);
    }
  }

  const byIdentity = new Map<string, SeedSentenceEntry>();
  for (const path of Object.keys(files)) {
    const sentencePath = path.replace("/characters/", "/sentences/");
    const document = parseSentenceSeed(JSON.parse(await readFile(sentencePath, "utf8")) as unknown);
    for (const entry of document.sentences) {
      const glyph = glyphs.get(`${entry.characterKey}:${entry.track}`);
      assert.ok(glyph, `${sentencePath}: unknown ${entry.characterKey}:${entry.track}`);
      assert.equal(Array.from(entry.text)[entry.targetIndex], glyph, `${sentencePath}: ${entry.characterKey}`);
      assert.equal(entry.text.codePointAt(entry.targetIndex), glyph.codePointAt(0), `${sentencePath}: ${entry.characterKey} code point`);
      assert.match(entry.source, /^(?:Tatoeba|개역간이국한문한글판|대한민국헌법|노동야학독본|국민 소학 독본|산중신곡|3·1독립선언서|군정법령 제\d+호) #\d+$/u, `${sentencePath}: ${entry.characterKey}`);
      assert.ok(sentenceAttribution(entry.source), `${sentencePath}: ${entry.characterKey} attribution`);
      if (entry.track === "kr") {
        assert.match(entry.text, /\p{Script=Hangul}/u, `${sentencePath}: ${entry.characterKey} Hangul`);
        assert.ok(entry.text.includes(glyph), `${sentencePath}: ${entry.characterKey} Hanja`);
        assert.equal(entry.sourceKind, entry.source.includes("독본") ? "textbook" : "corpus", `${sentencePath}: ${entry.characterKey} source kind`);
      }
      const identity = `${entry.characterKey}:${entry.track}:${entry.rank}`;
      const existing = byIdentity.get(identity);
      if (existing) assert.deepEqual(entry, existing, `${sentencePath}: conflicting duplicate ${identity}`);
      byIdentity.set(identity, entry);
    }
  }

  const krCovered = [...byIdentity.values()].filter((entry) => entry.track === "kr");
  assert.equal(krCovered.length, 218);
  assert.equal(new Set(krCovered.map((entry) => entry.characterKey)).size, 218);
  assert.equal(byIdentity.size, 814);
  assert.equal([...glyphs].filter(([identity]) => !byIdentity.has(`${identity}:0`)).length, 298);
  for (const [key, tracks] of trackCounts) {
    if (tracks.size === 3) {
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

test("full content seed loads cleanly and is idempotent", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(await readFile("migrations/0001_init.sql", "utf8"));
    const characterSql = await Promise.all(Object.keys(files).map(async (path) => (
      emitSeedSql(parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown))
    )));
    const sentenceSql = await Promise.all(Object.keys(files).map(async (path) => (
      emitSentenceSeedSql(parseSentenceSeed(JSON.parse(await readFile(path.replace("/characters/", "/sentences/"), "utf8")) as unknown))
    )));
    const sql = [...characterSql, ...sentenceSql].join("\n");
    sqlite.exec(sql);
    const counts = sqlite.prepare("SELECT (SELECT COUNT(*) FROM characters) AS characters, (SELECT COUNT(*) FROM character_tracks) AS tracks, (SELECT COUNT(*) FROM example_sentences) AS sentences").get();
    sqlite.exec(sql);
    assert.deepEqual(sqlite.prepare("SELECT (SELECT COUNT(*) FROM characters) AS characters, (SELECT COUNT(*) FROM character_tracks) AS tracks, (SELECT COUNT(*) FROM example_sentences) AS sentences").get(), counts);
    assert.equal(counts?.sentences, 814);
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
