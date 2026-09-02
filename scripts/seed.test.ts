import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { getCharacter, listByTrackLevel, listByUnit, searchDistractors } from "../worker/db/characters.ts";
import type { SeedDocument, SeedTrackEntry } from "../src/shared/types.ts";
import { applyMigrations } from "../worker/test/schema.ts";
import { emitSeedSql, emitSentenceSeedSql, levelOrdFor, parseSeed, parseSentenceSeed, parseWordSeed } from "./seed.ts";

function d1(sqlite: DatabaseSync): D1Database {
  const adapter = {
    prepare(query: string) {
      let values: SQLInputValue[] = [];
      const prepared = {
        bind(...next: unknown[]) {
          values = next.map((value) => {
            if (typeof value === "string" || typeof value === "number" || typeof value === "bigint" || value === null) return value;
            throw new Error(`Unsupported test binding: ${String(value)}`);
          });
          return prepared;
        },
        async all<T>() {
          return { results: sqlite.prepare(query).all(...values) as T[] };
        },
      };
      return prepared;
    },
  };
  return adapter as D1Database;
}

function comparableTrack(track: SeedTrackEntry): Record<string, unknown> {
  const fields: Record<string, unknown> = { ...track };
  delete fields.sentences;
  delete fields.characterId;
  return fields;
}

test("production migrations apply in filename order", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    const names = applyMigrations(sqlite);
    assert.ok(names.length > 0);
    assert.deepEqual(names, [...names].sort());
    assert.equal((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  } finally {
    sqlite.close();
  }
});

test("seed validation, round-trip, idempotency, and queries", async () => {
  assert.equal(levelOrdFor("kr", "8급"), 1);
  assert.equal(levelOrdFor("kr", "특급"), 15);
  assert.equal(levelOrdFor("jp", "N5"), 1);
  assert.equal(levelOrdFor("jp", "N1"), 5);
  assert.equal(levelOrdFor("cn", "HSK 7-9"), 7);
  assert.throws(() => levelOrdFor("cn", "HSK 10"), /Unknown cn level/);

  const sample: unknown = JSON.parse(await readFile("data/characters.sample.json", "utf8"));
  const document = parseSeed(sample);
  assert.equal(document.characters.length, 12);
  assert.equal(document.characters.flatMap((entry) => entry.tracks).length, 36);

  assert.throws(
    () => parseSeed([{
      key: "壞", meaningEn: "", meaningKo: "나쁠", variants: { kr: "壞" }, strokeCount: null,
      tracks: [{ track: "kr", glyph: "壞", reading: "무너질 괴", level: "3급", levelOrd: 11 }],
    }]),
    /entry "壞"\.meaningEn/,
  );

  const sqlite = new DatabaseSync(":memory:");
  try {
    // Deliberately exercise only the schema columns emitted by character seeds.
    sqlite.exec(await readFile("migrations/0001_init.sql", "utf8"));
    sqlite.exec(await readFile("migrations/0013_sentence_readings.sql", "utf8"));
    sqlite.exec(await readFile("migrations/0015_curriculum_unit_level_ord.sql", "utf8"));
    const sql = emitSeedSql(document);
    assert.doesNotMatch(sql, /\b(?:BEGIN|COMMIT)\b/);
    sqlite.exec(sql);
    const counts = sqlite.prepare("SELECT (SELECT COUNT(*) FROM characters) AS characters, (SELECT COUNT(*) FROM character_tracks) AS tracks, (SELECT COUNT(*) FROM example_sentences) AS sentences").get();
    sqlite.exec(emitSeedSql(document));
    assert.deepEqual(sqlite.prepare("SELECT (SELECT COUNT(*) FROM characters) AS characters, (SELECT COUNT(*) FROM character_tracks) AS tracks, (SELECT COUNT(*) FROM example_sentences) AS sentences").get(), counts);

    const db = d1(sqlite);
    for (const source of document.characters) {
      const loaded = await getCharacter(db, source.key);
      assert.ok(loaded);
      assert.equal(loaded.meaningEn, source.meaningEn);
      assert.equal(loaded.meaningKo, source.meaningKo);
      assert.equal(loaded.strokeCount, source.strokeCount);
      assert.deepEqual(loaded.variants, source.variants);
      assert.deepEqual(loaded.tracks.map(comparableTrack), source.tracks.map(comparableTrack));
      for (const sourceTrack of source.tracks) {
        assert.deepEqual(
          loaded.sentences.filter((sentence) => sentence.track === sourceTrack.track).map((sentence) => ({
            text: sentence.text,
            reading: sentence.reading,
            translationKo: sentence.translationKo,
            source: sentence.source,
            sourceKind: sentence.sourceKind,
            targetIndex: sentence.targetIndex,
            rank: sentence.rank,
          })),
          sourceTrack.sentences ?? [],
        );
      }
    }

    const learning = await getCharacter(db, "學");
    assert.deepEqual(learning?.tracks.map((entry) => entry.glyph), ["學", "学", "学"]);

    const krLevelOne = await listByTrackLevel(db, "kr", 1);
    assert.equal(krLevelOne.length, 6);
    assert.ok(krLevelOne.every((entry) => entry.tracks.length === 3));

    const mountain = await getCharacter(db, "山");
    assert.ok(mountain);
    const distractors = await searchDistractors(db, "kr", 1, mountain.id, 3);
    const readings = distractors.map((entry) => entry.track === "kr" ? entry.reading : "");
    assert.equal(distractors.length, 3);
    assert.equal(new Set(readings).size, 3);
    assert.ok(!readings.includes("뫼 산"));

    const oneTrack: SeedDocument = {
      characters: [{
        key: "只", meaningEn: "only", meaningKo: "다만", variants: { kr: "只" }, strokeCount: 5,
        tracks: [{ track: "kr", glyph: "只", reading: "다만 지", level: "3급", levelOrd: 11 }],
      }],
      curriculumUnits: [{
        track: "kr", level: "3급", ord: 1, title: "표현", subtitle: "3급 · UNIT 1",
        members: [{ key: "只", ord: 1 }],
      }],
    };
    sqlite.exec(emitSeedSql(oneTrack));
    assert.equal((sqlite.prepare("SELECT level_ord FROM curriculum_units WHERE track = 'kr' AND level = '3급'").get() as { level_ord: number }).level_ord, 11);
    assert.equal((await getCharacter(db, "只"))?.tracks.length, 1);
    assert.deepEqual((await listByUnit(db, 1)).map((entry) => entry.key), ["只"]);
  } finally {
    sqlite.close();
  }
});

test("standalone sentence seeds validate and remain idempotent", () => {
  const document = parseSentenceSeed({ sentences: [{
    character_key: "學", track: "jp", text: "学校へ行く。", reading: "がっこうへいく。", translation_ko: "학교에 간다.",
    source: "Tatoeba #1", source_kind: "corpus", target_index: 0, rank: 0,
  }] });
  assert.deepEqual(document.sentences[0], {
    characterKey: "學", track: "jp", text: "学校へ行く。", reading: "がっこうへいく。", translationKo: "학교에 간다.",
    source: "Tatoeba #1", sourceKind: "corpus", targetIndex: 0, rank: 0,
  });
  assert.throws(() => parseSentenceSeed({ sentences: [{
    character_key: "學", track: "jp", text: "学校へ行く。", reading: "がっこうへいく。", translation_ko: "학교에 간다.",
    source: "Tatoeba #1", source_kind: "corpus", target_index: 20, rank: 0,
  }] }), /outside text/);

  const sqlite = new DatabaseSync(":memory:");
  try {
    // Deliberately exercise only the schema columns emitted by sentence seeds.
    sqlite.exec(readFileSync("migrations/0001_init.sql", "utf8"));
    sqlite.exec(readFileSync("migrations/0013_sentence_readings.sql", "utf8"));
    sqlite.exec(readFileSync("migrations/0015_curriculum_unit_level_ord.sql", "utf8"));
    const character = parseSeed([{
      key: "學", meaningEn: "study", meaningKo: "배우다", variants: { jp: "学" }, strokeCount: 16,
      tracks: [{ track: "jp", glyph: "学", on: "ガク", kun: "まなぶ", kanken: "1級", jlpt: "N5", levelOrd: 1 }],
    }]);
    sqlite.exec(emitSeedSql(character));
    const sql = emitSentenceSeedSql(document);
    sqlite.exec(sql);
    sqlite.exec(sql);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM example_sentences").get()?.count, 1);
  } finally {
    sqlite.close();
  }
});

test("word seeds validate track-specific readings, levels, and revision hosts", () => {
  const base = { glyph: "學校", levelOrd: 1, members: ["學", "校"] };
  assert.equal(parseWordSeed({ words: [{ ...base, track: "kr", reading: "학교", level: "8급", sourceUrl: "https://ko.wiktionary.org/w/index.php?title=학교&oldid=1" }] }).words[0].track, "kr");
  assert.equal(parseWordSeed({ words: [{ ...base, track: "jp", glyph: "学校", reading: "がっこう", level: "N5", sourceUrl: "https://ja.wiktionary.org/w/index.php?title=学校&oldid=2" }] }).words[0].track, "jp");
  assert.equal(parseWordSeed({ words: [{ ...base, track: "cn", glyph: "学校", reading: "xué xiào", level: "HSK 1", sourceUrl: "https://zh.wiktionary.org/w/index.php?title=學校&oldid=3" }] }).words[0].track, "cn");
  assert.throws(() => parseWordSeed({ words: [{ ...base, track: "jp", reading: "gakkou", level: "N5", sourceUrl: "https://ja.wiktionary.org/w/index.php?title=学校&oldid=2" }] }), /expected kana/);
  assert.throws(() => parseWordSeed({ words: [{ ...base, track: "cn", reading: "xue2 xiao4", level: "HSK 1", sourceUrl: "https://zh.wiktionary.org/w/index.php?title=學校&oldid=3" }] }), /tone-marked pinyin/);
  assert.throws(() => parseWordSeed({ words: [{ ...base, track: "cn", reading: "xué xiào", level: "HSK 1", sourceUrl: "https://ja.wiktionary.org/w/index.php?title=學校&oldid=3" }] }), /immutable cn Wiktionary revision/);
  assert.throws(() => parseWordSeed({ words: [{ ...base, track: "kr", glyph: "韓國語", reading: "한국어", level: "8급", sourceUrl: "https://ko.wiktionary.org/w/index.php?title=한국어&oldid=1", members: ["韓", "國", "語"] }] }), /two-character compound/);
});
