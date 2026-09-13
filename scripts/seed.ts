import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import {
  TRACKS,
  type SeedCharacterEntry,
  type SeedCurriculumUnit,
  type SeedDocument,
  type SeedSentence,
  type SeedSentenceDocument,
  type SeedSentenceEntry,
  type SeedTrackEntry,
  type SeedWordDocument,
  type SeedWordEntry,
  type SourceKind,
  type Track,
} from "../shared/types.ts";

export const LEVEL_ORDS: Record<Track, Readonly<Record<string, number>>> = {
  kr: {
    "8급": 1, "7급II": 2, "7급": 3, "6급II": 4, "6급": 5,
    "5급II": 6, "5급": 7, "4급II": 8, "4급": 9, "3급II": 10,
    "3급": 11, "2급": 12, "1급": 13, "특급II": 14, "특급": 15,
  },
  jp: {
    N5: 1, N4: 2, N3: 3, N2: 4, N1: 5,
  },
  cn: { "HSK 1": 1, "HSK 2": 2, "HSK 3": 3, "HSK 4": 4, "HSK 5": 5, "HSK 6": 6, "HSK 7-9": 7 },
};

export function levelOrdFor(track: Track, level: string): number {
  const value = LEVEL_ORDS[track][level];
  if (value === undefined) throw new Error(`Unknown ${track} level: ${level}`);
  return value;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${path}: expected object`);
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path}: expected array`);
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${path}: expected non-empty string`);
  return value;
}

function integer(value: unknown, path: string, min = 0): number {
  if (!Number.isInteger(value) || (value as number) < min) throw new Error(`${path}: expected integer >= ${min}`);
  return value as number;
}

function sentenceTarget(value: unknown, path: string, kind: Track): number | null {
  if (value !== null) return integer(value, path);
  if (kind !== "kr") throw new Error(`${path}: expected integer >= 0`);
  return null;
}

function track(value: unknown, path: string): Track {
  if (typeof value !== "string" || !TRACKS.includes(value as Track)) throw new Error(`${path}: expected kr, jp, or cn`);
  return value as Track;
}

function sourceKind(value: unknown, path: string): SourceKind {
  if (value !== "textbook" && value !== "past_paper" && value !== "corpus") {
    throw new Error(`${path}: expected textbook, past_paper, or corpus`);
  }
  return value;
}

function sentence(value: unknown, path: string, glyph: string, kind: Track): SeedSentence {
  const input = record(value, path);
  const text = string(input.text, `${path}.text`);
  const targetIndex = sentenceTarget(input.targetIndex, `${path}.targetIndex`, kind);
  if (targetIndex !== null && Array.from(text)[targetIndex] !== glyph) throw new Error(`${path}.targetIndex: does not point to ${glyph}`);
  const reading = input.reading === null ? null : string(input.reading, `${path}.reading`);
  if ((kind === "kr") !== (reading === null)) throw new Error(`${path}.reading: expected ${kind === "kr" ? "null" : `${kind} reading`}`);

  return {
    text,
    reading,
    translationKo: string(input.translationKo, `${path}.translationKo`),
    source: string(input.source, `${path}.source`),
    sourceKind: sourceKind(input.sourceKind, `${path}.sourceKind`),
    targetIndex,
    rank: integer(input.rank, `${path}.rank`),
  };
}

function seedTrack(value: unknown, path: string, key: string, variants: Partial<Record<Track, string>>): SeedTrackEntry {
  const input = record(value, path);
  const kind = track(input.track, `${path}.track`);
  const glyph = string(input.glyph, `${path}.glyph`);
  if (glyph !== (variants[kind] ?? key)) throw new Error(`${path}.glyph: expected ${variants[kind] ?? key}`);
  const levelField = kind === "kr" ? "level" : kind === "jp" ? "jlpt" : "hsk";
  const level = string(input[levelField], `${path}.${levelField}`);
  const levelOrd = integer(input.levelOrd, `${path}.levelOrd`, 1);
  if (levelOrd !== levelOrdFor(kind, level)) throw new Error(`${path}.levelOrd: expected ${levelOrdFor(kind, level)} for ${level}`);
  const sentences = input.sentences === undefined
    ? undefined
    : array(input.sentences, `${path}.sentences`).map((item, index) => sentence(item, `${path}.sentences[${index}]`, glyph, kind));
  const base = { track: kind, glyph, levelOrd, sentences };

  if (kind === "kr") {
    return { ...base, track: "kr", reading: string(input.reading, `${path}.reading`), level };
  }
  if (kind === "jp") {
    return {
      ...base,
      track: "jp",
      on: string(input.on, `${path}.on`),
      kun: string(input.kun, `${path}.kun`),
      kanken: string(input.kanken, `${path}.kanken`),
      jlpt: level,
    };
  }
  return {
    ...base,
    track: "cn",
    pinyin: string(input.pinyin, `${path}.pinyin`),
    meaning: string(input.meaning, `${path}.meaning`),
    hsk: level,
    tier: string(input.tier, `${path}.tier`),
  };
}

function character(value: unknown, index: number): SeedCharacterEntry {
  const raw = record(value, `entry[${index}]`);
  const key = string(raw.key, `entry[${index}].key`);
  const path = `entry "${key}"`;
  const rawVariants = record(raw.variants, `${path}.variants`);
  const variants: Partial<Record<Track, string>> = {};
  for (const kind of TRACKS) {
    if (rawVariants[kind] !== undefined) variants[kind] = string(rawVariants[kind], `${path}.variants.${kind}`);
  }
  const tracks = array(raw.tracks, `${path}.tracks`).map((item, trackIndex) => seedTrack(item, `${path}.tracks[${trackIndex}]`, key, variants));
  if (tracks.length === 0) throw new Error(`${path}.tracks: expected at least one track`);
  if (new Set(tracks.map((item) => item.track)).size !== tracks.length) throw new Error(`${path}.tracks: duplicate track`);

  return {
    key,
    meaningEn: string(raw.meaningEn, `${path}.meaningEn`),
    meaningKo: string(raw.meaningKo, `${path}.meaningKo`),
    variants,
    strokeCount: raw.strokeCount === null ? null : integer(raw.strokeCount, `${path}.strokeCount`, 1),
    tracks,
  };
}

function curriculumUnit(value: unknown, index: number, keys: Set<string>): SeedCurriculumUnit {
  const path = `curriculumUnits[${index}]`;
  const input = record(value, path);
  const members = array(input.members, `${path}.members`).map((item, memberIndex) => {
    const memberPath = `${path}.members[${memberIndex}]`;
    const raw = record(item, memberPath);
    const key = string(raw.key, `${memberPath}.key`);
    if (!keys.has(key)) throw new Error(`${memberPath}.key: unknown character ${key}`);
    return { key, ord: integer(raw.ord, `${memberPath}.ord`, 1) };
  });
  if (new Set(members.map((item) => item.key)).size !== members.length) throw new Error(`${path}.members: duplicate character`);
  if (new Set(members.map((item) => item.ord)).size !== members.length) throw new Error(`${path}.members: duplicate ord`);

  return {
    track: track(input.track, `${path}.track`),
    level: string(input.level, `${path}.level`),
    ord: integer(input.ord, `${path}.ord`, 1),
    title: string(input.title, `${path}.title`),
    subtitle: string(input.subtitle, `${path}.subtitle`),
    members,
  };
}

export function parseSeed(value: unknown): SeedDocument {
  const rawCharacters = Array.isArray(value) ? value : array(record(value, "seed").characters, "seed.characters");
  const characters = rawCharacters.map(character);
  const keys = new Set(characters.map((item) => item.key));
  if (keys.size !== characters.length) throw new Error("seed.characters: duplicate key");
  const rawUnits = Array.isArray(value) ? undefined : record(value, "seed").curriculumUnits;
  return {
    characters,
    curriculumUnits: rawUnits === undefined
      ? undefined
      : array(rawUnits, "seed.curriculumUnits").map((item, index) => curriculumUnit(item, index, keys)),
  };
}

export function parseSentenceSeed(value: unknown): SeedSentenceDocument {
  const rows = array(record(value, "seed").sentences, "seed.sentences");
  const sentences: SeedSentenceEntry[] = rows.map((value, index) => {
    const path = `sentences[${index}]`;
    const input = record(value, path);
    const kind = track(input.track, `${path}.track`);
    const text = string(input.text, `${path}.text`);
    const targetIndex = sentenceTarget(input.target_index, `${path}.target_index`, kind);
    if (Array.from(text).length > 24) throw new Error(`${path}.text: expected at most 24 characters`);
    if (targetIndex !== null && Array.from(text)[targetIndex] === undefined) throw new Error(`${path}.target_index: outside text`);
    const reading = input.reading === null ? null : string(input.reading, `${path}.reading`);
    if ((kind === "kr") !== (reading === null)) throw new Error(`${path}.reading: expected ${kind === "kr" ? "null" : `${kind} reading`}`);
    return {
      characterKey: string(input.character_key, `${path}.character_key`),
      track: kind,
      text,
      reading,
      translationKo: string(input.translation_ko, `${path}.translation_ko`),
      source: string(input.source, `${path}.source`),
      sourceKind: sourceKind(input.source_kind, `${path}.source_kind`),
      targetIndex,
      rank: integer(input.rank, `${path}.rank`),
    };
  });
  const identities = sentences.map((entry) => `${entry.characterKey}:${entry.track}:${entry.rank}`);
  if (new Set(identities).size !== identities.length) throw new Error("seed.sentences: duplicate character, track, and rank");
  return { sentences };
}

export function parseWordSeed(value: unknown): SeedWordDocument {
  const rows = array(record(value, "seed").words, "seed.words");
  const words: SeedWordEntry[] = rows.map((value, index) => {
    const path = `words[${index}]`;
    const input = record(value, path);
    const kind = track(input.track, `${path}.track`);
    const glyph = string(input.glyph, `${path}.glyph`);
    const reading = string(input.reading, `${path}.reading`);
    const level = string(input.level, `${path}.level`);
    const levelOrd = integer(input.levelOrd, `${path}.levelOrd`, 1);
    const members = array(input.members, `${path}.members`).map((member, memberIndex) => string(member, `${path}.members[${memberIndex}]`));
    // Keep compounds at two characters: the card grades exactly two existing
    // character states and the current UI is designed for a two-glyph target.
    if (Array.from(glyph).length !== 2 || members.length !== 2) throw new Error(`${path}: expected a two-character compound`);
    if (!/^\p{Script=Han}{2}$/u.test(glyph)) throw new Error(`${path}.glyph: expected two Han characters`);
    if (new Set(members).size !== members.length) throw new Error(`${path}.members: duplicate character`);
    const validReading = kind === "kr"
      ? /^\p{Script=Hangul}{2}$/u.test(reading)
      : kind === "jp"
        ? /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(reading)
        : /^(?=[a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+ [a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+$)(?=.*[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ])/u.test(reading);
    if (!validReading) throw new Error(`${path}.reading: expected ${kind === "kr" ? "two Hangul syllables" : kind === "jp" ? "kana" : "two-syllable tone-marked pinyin"}`);
    if (levelOrd !== levelOrdFor(kind, level)) throw new Error(`${path}.levelOrd: expected ${levelOrdFor(kind, level)} for ${level}`);
    const sourceUrl = string(input.sourceUrl, `${path}.sourceUrl`);
    const sourceHost = { kr: "ko.wiktionary.org", jp: "ja.wiktionary.org", cn: "zh.wiktionary.org" }[kind];
    let source: URL;
    try {
      source = new URL(sourceUrl);
    } catch {
      throw new Error(`${path}.sourceUrl: expected an immutable ${kind} Wiktionary revision`);
    }
    const params = [...source.searchParams.keys()];
    if (source.origin !== `https://${sourceHost}` || source.username || source.password || source.hash || source.pathname !== "/w/index.php"
      || params.length !== 2 || params[0] !== "title" || params[1] !== "oldid"
      || !source.searchParams.get("title") || !/^\d+$/u.test(source.searchParams.get("oldid") ?? "")) {
      throw new Error(`${path}.sourceUrl: expected an immutable ${kind} Wiktionary revision`);
    }
    return { track: kind, glyph, reading, level, levelOrd, sourceUrl, members };
  });
  const identities = words.map((word) => `${word.track}:${word.glyph}:${word.reading}`);
  if (new Set(identities).size !== identities.length) throw new Error("seed.words: duplicate track, glyph, and reading");
  return { words };
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function nullable(value: string | null): string {
  return value === null ? "NULL" : quote(value);
}

function curriculumLevelOrd(document: SeedDocument, unit: SeedCurriculumUnit): number {
  // Chinese units intentionally repeat characters whose stored band remains earlier.
  if (unit.track === "cn") return levelOrdFor(unit.track, unit.level);
  const memberLevels = unit.members.flatMap((member) => document.characters
    .find((character) => character.key === member.key)?.tracks
    .filter((entry) => entry.track === unit.track)
    .map((entry) => entry.levelOrd) ?? []);
  return memberLevels.length > 0 ? Math.min(...memberLevels) : levelOrdFor(unit.track, unit.level);
}

export function emitSeedSql(document: SeedDocument): string {
  const sql = ["PRAGMA foreign_keys = ON;"];
  for (const item of document.characters) {
    sql.push(`INSERT INTO characters (key, meaning_en, meaning_ko, variants, stroke_count) VALUES (${quote(item.key)}, ${quote(item.meaningEn)}, ${quote(item.meaningKo)}, ${quote(JSON.stringify(item.variants))}, ${item.strokeCount ?? "NULL"}) ON CONFLICT(key) DO UPDATE SET meaning_en=excluded.meaning_en, meaning_ko=excluded.meaning_ko, variants=excluded.variants, stroke_count=excluded.stroke_count;`);
    for (const itemTrack of item.tracks) {
      const values = itemTrack.track === "kr"
        ? [itemTrack.reading, itemTrack.level, null, null, null, null, null, null, null, null]
        : itemTrack.track === "jp"
          ? [null, null, itemTrack.on, itemTrack.kun, itemTrack.kanken, itemTrack.jlpt, null, null, null, null]
          : [null, null, null, null, null, null, itemTrack.pinyin, itemTrack.meaning, itemTrack.hsk, itemTrack.tier];
      sql.push(`INSERT INTO character_tracks (character_id, track, glyph, kr_reading, kr_level, jp_on, jp_kun, jp_kanken, jp_jlpt, cn_pinyin, cn_meaning, cn_hsk, cn_tier, level_ord) VALUES ((SELECT id FROM characters WHERE key=${quote(item.key)}), ${quote(itemTrack.track)}, ${quote(itemTrack.glyph)}, ${values.map(nullable).join(", ")}, ${itemTrack.levelOrd}) ON CONFLICT(character_id, track) DO UPDATE SET glyph=excluded.glyph, kr_reading=excluded.kr_reading, kr_level=excluded.kr_level, jp_on=excluded.jp_on, jp_kun=excluded.jp_kun, jp_kanken=excluded.jp_kanken, jp_jlpt=excluded.jp_jlpt, cn_pinyin=excluded.cn_pinyin, cn_meaning=excluded.cn_meaning, cn_hsk=excluded.cn_hsk, cn_tier=excluded.cn_tier, level_ord=excluded.level_ord;`);
      for (const example of itemTrack.sentences ?? []) {
        sql.push(`INSERT INTO example_sentences (character_id, track, text, reading, translation_ko, source, source_kind, target_index, rank) VALUES ((SELECT id FROM characters WHERE key=${quote(item.key)}), ${quote(itemTrack.track)}, ${quote(example.text)}, ${nullable(example.reading)}, ${quote(example.translationKo)}, ${quote(example.source)}, ${quote(example.sourceKind)}, ${example.targetIndex ?? "NULL"}, ${example.rank}) ON CONFLICT(character_id, track, rank) DO UPDATE SET text=excluded.text, reading=excluded.reading, translation_ko=excluded.translation_ko, source=excluded.source, source_kind=excluded.source_kind, target_index=excluded.target_index;`);
      }
    }
  }
  for (const unit of document.curriculumUnits ?? []) {
    sql.push(`INSERT INTO curriculum_units (track, level, level_ord, ord, title, subtitle) VALUES (${quote(unit.track)}, ${quote(unit.level)}, ${curriculumLevelOrd(document, unit)}, ${unit.ord}, ${quote(unit.title)}, ${quote(unit.subtitle)}) ON CONFLICT(track, level, ord) DO UPDATE SET level_ord=excluded.level_ord, title=excluded.title, subtitle=excluded.subtitle;`);
    for (const member of unit.members) {
      sql.push(`INSERT INTO curriculum_unit_members (unit_id, character_id, ord) VALUES ((SELECT id FROM curriculum_units WHERE track=${quote(unit.track)} AND level=${quote(unit.level)} AND ord=${unit.ord}), (SELECT id FROM characters WHERE key=${quote(member.key)}), ${member.ord}) ON CONFLICT(unit_id, character_id) DO UPDATE SET ord=excluded.ord;`);
    }
  }
  return `${sql.join("\n")}\n`;
}

export function emitSentenceSeedSql(document: SeedSentenceDocument): string {
  return `${[
    "PRAGMA foreign_keys = ON;",
    ...document.sentences.map((entry) => `INSERT INTO example_sentences (character_id, track, text, reading, translation_ko, source, source_kind, target_index, rank) VALUES ((SELECT id FROM characters WHERE key=${quote(entry.characterKey)}), ${quote(entry.track)}, ${quote(entry.text)}, ${nullable(entry.reading)}, ${quote(entry.translationKo)}, ${quote(entry.source)}, ${quote(entry.sourceKind)}, ${entry.targetIndex ?? "NULL"}, ${entry.rank}) ON CONFLICT(character_id, track, rank) DO UPDATE SET text=excluded.text, reading=excluded.reading, translation_ko=excluded.translation_ko, source=excluded.source, source_kind=excluded.source_kind, target_index=excluded.target_index;`),
  ].join("\n")}\n`;
}

export function emitWordSeedSql(document: SeedWordDocument): string {
  const sql = ["PRAGMA foreign_keys = ON;"];
  for (const word of document.words) {
    const identity = `track=${quote(word.track)} AND glyph=${quote(word.glyph)} AND reading=${quote(word.reading)}`;
    sql.push(`INSERT INTO words (track, glyph, reading, level, level_ord, source_url) VALUES (${quote(word.track)}, ${quote(word.glyph)}, ${quote(word.reading)}, ${quote(word.level)}, ${word.levelOrd}, ${quote(word.sourceUrl)}) ON CONFLICT(track, glyph, reading) DO UPDATE SET level=excluded.level, level_ord=excluded.level_ord, source_url=excluded.source_url;`);
    sql.push(`DELETE FROM word_members WHERE word_id=(SELECT id FROM words WHERE ${identity});`);
    word.members.forEach((key, position) => sql.push(`INSERT INTO word_members (word_id, character_id, position) VALUES ((SELECT id FROM words WHERE ${identity}), (SELECT id FROM characters WHERE key=${quote(key)}), ${position});`));
  }
  return `${sql.join("\n")}\n`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = args.includes("--remote") ? "--remote" : "--local";
  const files = args.filter((arg) => !arg.startsWith("--"));
  const paths = files.length > 0 ? files : ["data/characters.sample.json"];
  const documents = await Promise.all(paths.map(async (path) => {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    const isDocument = typeof value === "object" && value !== null;
    if (isDocument && "sentences" in value) return emitSentenceSeedSql(parseSentenceSeed(value));
    if (isDocument && "words" in value) return emitWordSeedSql(parseWordSeed(value));
    return emitSeedSql(parseSeed(value));
  }));
  const directory = await mkdtemp(join(tmpdir(), "hanja-seed-"));
  const sqlPath = join(directory, "seed.sql");
  try {
    await writeFile(sqlPath, documents.join("\n"));
    const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["wrangler", "d1", "execute", "hanja", mode, "--file", sqlPath], { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`wrangler exited with status ${result.status}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
