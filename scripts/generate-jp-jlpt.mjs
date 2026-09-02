/* global console, process */
import { createHash } from "node:crypto";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [kanjiDataDirectory, shinjitaiDirectory, hanjaDictPath] = process.argv.slice(2);
if (!kanjiDataDirectory || !shinjitaiDirectory || !hanjaDictPath) {
  throw new Error("usage: node scripts/generate-jp-jlpt.mjs <kanji-data-checkout> <shinjitai-table-checkout> <hanjadict-table.json>");
}

const levels = ["N5", "N4", "N3", "N2", "N1"];
const expectedCounts = { N5: 79, N4: 166, N3: 367, N2: 367, N1: 1232 };
const kankenByGrade = { 1: "10級", 2: "9級", 3: "8級", 4: "7級", 5: "6級", 6: "5級" };
const dataDirectory = "data/characters";

function pinnedJson(raw, name, expectedHash) {
  const actualHash = createHash("sha256").update(raw).digest("hex");
  if (actualHash !== expectedHash) throw new Error(`${name}: expected SHA-256 ${expectedHash}, got ${actualHash}`);
  return JSON.parse(raw.toString("utf8"));
}

function toKatakana(value) {
  return Array.from(value, (character) => {
    const point = character.codePointAt(0);
    return point >= 0x3041 && point <= 0x3096 ? String.fromCodePoint(point + 0x60) : character;
  }).join("");
}

function koreanMeaning(reading) {
  const words = reading.split(/[/,]/u)[0].trim().split(/\s+/u);
  words.pop();
  if (words.length === 0) throw new Error(`cannot derive sourced Korean meaning from ${reading}`);
  return words.join(" ");
}

const [kanjiDataRaw, shinjitaiRaw, hanjaDictRaw] = await Promise.all([
  readFile(join(kanjiDataDirectory, "kanji.json")),
  readFile(join(shinjitaiDirectory, "shinjitai.json")),
  readFile(hanjaDictPath),
]);
const kanjiData = pinnedJson(kanjiDataRaw, "kanji.json", "561b72ea9df703c58fae0c68585812e172aaa7611d2fcee6719d55fd2dfd4fa4");
const shinjitai = pinnedJson(shinjitaiRaw, "shinjitai.json", "e0d59f319748555eff8d6bb0db9c5938974a7b184094e4bebfb1ef02de8582be");
const rawHanjaDict = pinnedJson(hanjaDictRaw, "HanjaDict table.json", "d36ceb0d37ed53b9af78a88517ebc1499502cdef0367c396ff723460af52e471");
const hanjaDict = new Map(Object.entries(rawHanjaDict).map(([glyph, reading]) => [glyph.normalize("NFKC"), reading]));
const sourceNames = (await readdir(dataDirectory)).filter((name) => name.endsWith(".json"));
const sourceDocuments = new Map();
const variantsByKey = new Map();
const aliasToKey = new Map();
for (const name of sourceNames) {
  const document = JSON.parse(await readFile(join(dataDirectory, name), "utf8"));
  sourceDocuments.set(name, document);
  for (const character of document.characters ?? []) {
    variantsByKey.set(character.key, { ...(variantsByKey.get(character.key) ?? {}), ...character.variants });
    aliasToKey.set(character.key, character.key);
    for (const glyph of Object.values(character.variants)) aliasToKey.set(glyph, character.key);
  }
}

const entries = Object.entries(kanjiData).flatMap(([glyph, source]) => {
  if (!Number.isInteger(source.jlpt_new)) return [];
  const oldGlyph = (shinjitai[glyph]?.[0] ?? glyph).normalize("NFKC");
  const key = aliasToKey.get(glyph) ?? aliasToKey.get(oldGlyph) ?? oldGlyph;
  const canonicalSource = kanjiData[key] ?? kanjiData[oldGlyph];
  const reading = hanjaDict.get(key.normalize("NFKC")) ?? hanjaDict.get(oldGlyph);
  if (!source.meanings?.length || !canonicalSource || !Number.isInteger(canonicalSource.strokes) || !reading) {
    throw new Error(`missing sourced fields for ${glyph}/${key}`);
  }
  const on = source.readings_on.length === 0 ? "なし" : source.readings_on.map((value) => toKatakana(value).replaceAll(".", "-")).join("・");
  const kun = source.readings_kun.length === 0 ? "なし" : source.readings_kun.map((value) => value.replaceAll(".", "-")).join("・");
  const level = `N${source.jlpt_new}`;
  return [{
    key,
    meaningEn: source.meanings[0].toLowerCase(),
    meaningKo: koreanMeaning(reading),
    variants: { ...(variantsByKey.get(key) ?? {}), jp: glyph },
    strokeCount: canonicalSource.strokes,
    tracks: [{
      track: "jp",
      glyph,
      on,
      kun,
      kanken: kankenByGrade[source.grade] ?? "未指定",
      jlpt: level,
      levelOrd: levels.indexOf(level) + 1,
    }],
    frequency: Number.isInteger(source.freq) ? source.freq : Number.MAX_SAFE_INTEGER,
  }];
});
if (new Set(entries.map((entry) => entry.key)).size !== entries.length) throw new Error("canonical Japanese keys must be unique");
const membershipHash = createHash("sha256").update(entries.map((entry) => `${entry.tracks[0].glyph}:${entry.tracks[0].jlpt}`).sort().join("\n")).digest("hex");
if (membershipHash !== "40a3d0786b8ec0960fe7c917ffae564a4b603fd9ed5678be86c7eb09bbf39f13") {
  throw new Error(`JLPT membership: unexpected SHA-256 ${membershipHash}`);
}

for (const [levelIndex, level] of levels.entries()) {
  const levelEntries = entries
    .filter((entry) => entry.tracks[0].jlpt === level)
    .sort((left, right) => left.frequency - right.frequency || left.tracks[0].glyph.localeCompare(right.tracks[0].glyph));
  if (levelEntries.length !== expectedCounts[level]) throw new Error(`${level}: expected ${expectedCounts[level]} characters, got ${levelEntries.length}`);
  const unitCount = Math.ceil(levelEntries.length / 10);
  const baseSize = Math.floor(levelEntries.length / unitCount);
  const remainder = levelEntries.length % unitCount;
  let offset = 0;
  const curriculumUnits = Array.from({ length: unitCount }, (_, unitIndex) => {
    const size = baseSize + (unitIndex < remainder ? 1 : 0);
    const members = levelEntries.slice(offset, offset + size);
    offset += size;
    return {
      track: "jp",
      level,
      ord: unitIndex + 1,
      title: `${level} ${unitIndex + 1}`,
      subtitle: `${size}字`,
      members: members.map((entry, index) => ({ key: entry.key, ord: index + 1 })),
    };
  });
  const characters = levelEntries.map((entry) => ({ ...entry }));
  for (const character of characters) delete character.frequency;
  await writeFile(join(dataDirectory, `jp-jlpt-${level.toLowerCase()}.json`), `${JSON.stringify({ characters, curriculumUnits }, null, 2)}\n`);
  if (characters.some((character) => character.tracks[0].levelOrd !== levelIndex + 1)) throw new Error(`${level}: invalid ordinal`);
}

const completeVariants = new Map(entries.map((entry) => [entry.key, entry.variants]));
for (const [name, document] of sourceDocuments) {
  if (name.startsWith("jp-")) continue;
  let changed = false;
  for (const character of document.characters ?? []) {
    const variants = completeVariants.get(character.key);
    if (!variants) continue;
    const merged = { ...character.variants, ...variants };
    if (JSON.stringify(merged) === JSON.stringify(character.variants)) continue;
    character.variants = merged;
    changed = true;
  }
  if (changed) await writeFile(join(dataDirectory, name), `${JSON.stringify(document, null, 2)}\n`);
}
for (const name of sourceNames.filter((name) => name.startsWith("jp-") && !/^jp-jlpt-n[1-5]\.json$/u.test(name))) {
  await rm(join(dataDirectory, name));
}

console.log(JSON.stringify(Object.fromEntries(levels.map((level) => [level, entries.filter((entry) => entry.tracks[0].jlpt === level).length]))));
