import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { sentenceAttribution } from "../src/shared/sentenceAttribution.ts";
import { emitSeedSql, emitSentenceSeedSql, parseSeed, parseSentenceSeed } from "./seed.ts";
import type { SeedSentenceEntry, Track } from "../src/shared/types.ts";

const files = {
  "data/characters/kr-8geup.json": 50,
  "data/characters/kr-7geup.json": 100,
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

test("sourced sentence files resolve to their exact target glyph", async () => {
  const glyphs = new Map<string, string>();
  const trackCounts = new Map<string, Set<Track>>();
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
  assert.equal(krCovered.length, 127);
  assert.equal(new Set(krCovered.map((entry) => entry.characterKey)).size, 127);
  assert.equal(byIdentity.size, 723);
  assert.equal([...glyphs].filter(([identity]) => !byIdentity.has(`${identity}:0`)).length, 39);
  for (const [key, tracks] of trackCounts) {
    if (tracks.size === 3) {
      assert.ok([...byIdentity.values()].filter((entry) => entry.characterKey === key).length >= 2, key);
    }
  }
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
    assert.equal(counts?.sentences, 723);
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
