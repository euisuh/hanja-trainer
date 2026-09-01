import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { sentenceAttribution } from "../src/shared/sentenceAttribution.ts";
import { createPlacementState, isPlacementComplete, nextPlacementItem, placementResults, recordPlacementAnswer } from "../src/features/placement/adaptive.ts";
import { emitSeedSql, emitSentenceSeedSql, emitWordSeedSql, parseSeed, parseSentenceSeed, parseWordSeed } from "./seed.ts";
import { tierForTgh } from "./tgh-tier.ts";
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
  "data/characters/jp-kanken-8.json": 200,
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
          assert.match(entry.kun, /^[\p{Script=Hiragana}ー・-]+$/u, `${path}: ${character.key} kun`);
        }
        if (entry.track === "cn") assert.doesNotMatch(entry.pinyin, /\d/u, `${path}: ${character.key} pinyin`);
      }
      linked.set(character.key, tracks);
    }
  }

  assert.ok([...linked.values()].filter((tracks) => tracks.size >= 2).length >= 30);
});

test("Japanese grade deltas, official 8級 membership, units, and variants match the pinned sources", async () => {
  const scale = [
    { path: "data/characters/jp-kanken-10.json", level: "10級", levelOrd: 1, added: 80, cumulative: 80 },
    { path: "data/characters/jp-kanken-9.json", level: "9級", levelOrd: 2, added: 160, cumulative: 240 },
    { path: "data/characters/jp-kanken-8.json", level: "8級", levelOrd: 3, added: 200, cumulative: 440 },
  ];
  const allPaths = Object.keys(files);
  const documents = await Promise.all(allPaths.map(async (path) => parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown)));
  const byPath = new Map(allPaths.map((path, index) => [path, documents[index]]));
  let cumulative = 0;
  for (const expected of scale) {
    const characters = byPath.get(expected.path)!.characters;
    assert.equal(characters.length, expected.added, expected.level);
    assert.ok(characters.every((character) => character.tracks.some((track) => track.track === "jp" && track.levelOrd === expected.levelOrd)), expected.level);
    cumulative += characters.length;
    assert.equal(cumulative, expected.cumulative, `${expected.level} cumulative`);
  }

  const grade8 = byPath.get("data/characters/jp-kanken-8.json")!;
  const official = new Set(Array.from(
    "由氷湯炭真拾仕銀開悪油表登短深終死区階安有秒等談進習使苦寒暗遊病動着世集始具感医予品童注整住指君漢委" +
    "羊負農柱昔重歯係館意洋部波丁全宿詩軽岸育葉服配帳相所次血起員陽福倍調送暑事決期院様物箱追想助持研客飲" +
    "落平畑定息昭式県究運流返発庭速消実庫急泳旅勉反笛族商写湖級駅両放坂鉄他章者向宮央緑味板転打勝主幸球横" +
    "礼命皮都対乗守港去屋列面悲度待植取号橋温練問美投代申酒根業化路役鼻豆第身受祭曲荷和薬筆島題神州皿局界",
  ));
  assert.deepEqual(new Set(grade8.characters.map((character) => character.tracks.find((track) => track.track === "jp")!.glyph)), official);
  const members = grade8.curriculumUnits?.flatMap((unit) => unit.members.map((member) => member.key)) ?? [];
  assert.equal(members.length, 200);
  assert.equal(new Set(members).size, 200);
  assert.deepEqual(new Set(members), new Set(grade8.characters.map((character) => character.key)));
  assert.ok(grade8.curriculumUnits?.every((unit) => unit.track === "jp" && unit.level === "8級" && unit.members.length >= 8 && unit.members.length <= 10));
  const canonicalStrokes = new Map([
    ["轉", 18], ["乘", 10], ["驛", 23], ["硏", 11], ["兩", 8],
    ["橫", 16], ["豫", 16], ["齒", 15], ["縣", 16],
  ]);
  for (const character of grade8.characters) {
    const expected = canonicalStrokes.get(character.key);
    if (expected) assert.equal(character.strokeCount, expected, `${character.key} canonical strokes`);
  }

  const otherCharacters = documents.flatMap((document) => document.characters).filter((character) => !grade8.characters.includes(character));
  for (const character of grade8.characters) {
    for (const matching of otherCharacters.filter((candidate) => candidate.key === character.key)) {
      assert.deepEqual(matching.variants, character.variants, `${character.key} complete variants`);
    }
  }
});

test("seeded Japanese placement bounds and all-correct estimate reach 8級", async () => {
  const jpPaths = Object.keys(files).filter((path) => path.includes("/jp-"));
  let id = 0;
  const characters: CharacterEntry[] = (await Promise.all(jpPaths.map(async (path) => parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown))))
    .flatMap((document) => document.characters)
    .map((character) => {
      id += 1;
      return { ...character, id, createdAt: 0, sentences: [], tracks: character.tracks.map((track) => ({ ...track, characterId: id })) };
    });
  let state = createPlacementState(characters, ["jp"]);
  assert.deepEqual({ min: state.estimates.jp.minLevelOrd, max: state.estimates.jp.maxLevelOrd }, { min: 1, max: 3 });
  while (!isPlacementComplete(state)) {
    const item = nextPlacementItem(state, characters);
    assert.ok(item);
    state = recordPlacementAnswer(state, item, true);
  }
  assert.equal(placementResults(state)[0].levelOrd, 3);
});

test("Chinese source counts, HSK 3 membership, units, and variants match the pinned sources", async () => {
  assert.deepEqual(["2013:3500", "2013:3501", "2013:6500", "2013:6501", "2013:8105"].map(tierForTgh), ["一级字", "二级字", "二级字", "三级字", "三级字"]);
  for (const invalid of [undefined, "2013:0", "2013:8106", "3379", "2013:abc"]) assert.throws(() => tierForTgh(invalid), /invalid kTGH position/u);
  const cnPaths = ["data/characters/cn-hsk1.json", "data/characters/cn-hsk2.json", "data/characters/cn-hsk3.json"];
  assert.equal(
    createHash("sha256").update(await readFile(cnPaths[2])).digest("hex"),
    "3ddeee7742f6d8020eff5e659dee3c6c1043997dd3c4649e5081278328c82f9f",
    "re-run generate-cn-through-hsk3.mjs when the frozen output changes",
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
        if (path !== "data/characters/jp-kanken-8.json" && path !== "data/characters/cn-hsk3.json") {
          const legacyTracks = legacyTrackCounts.get(character.key) ?? new Set<Track>();
          legacyTracks.add(entry.track);
          legacyTrackCounts.set(character.key, legacyTracks);
        }
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
  assert.equal(krCovered.length, 218);
  assert.equal(new Set(krCovered.map((entry) => entry.characterKey)).size, 218);
  assert.equal(byIdentity.size, 932);
  assert.equal([...glyphs].filter(([identity]) => !byIdentity.has(`${identity}:0`)).length, 664);
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
    for (const migration of ["0001_init.sql", "0002_fsrs.sql", "0003_sessions.sql", "0010_words.sql"]) sqlite.exec(await readFile(`migrations/${migration}`, "utf8"));
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
    assert.equal(counts?.sentences, 932);
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
