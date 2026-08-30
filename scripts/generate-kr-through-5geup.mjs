/* global console, process */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [gradeDirectory, hanjaDictPath, unihanDirectory] = process.argv.slice(2);
if (!gradeDirectory || !hanjaDictPath || !unihanDirectory) {
  throw new Error("usage: node scripts/generate-kr-through-5geup.mjs <hanja-grade-dir> <hanjadict-table.json> <unihan-dir>");
}

const levels = [
  { source: "4.json", output: "kr-6geup2.json", level: "6급II", levelOrd: 4, sizes: [9, 9, 9, 8, 8, 8, 8, 8, 8] },
  { source: "5.json", output: "kr-6geup.json", level: "6급", levelOrd: 5, sizes: [9, 9, 9, 8, 8, 8, 8, 8, 8] },
  { source: "6.json", output: "kr-5geup2.json", level: "5급II", levelOrd: 6, sizes: Array(10).fill(10) },
  { source: "7.json", output: "kr-5geup.json", level: "5급", levelOrd: 7, sizes: Array(10).fill(10) },
];

const categories = [
  /school|study|learn|teach|book|write|read|word|speech|language|literature|chapter|title|explain|knowledge|record|document/u,
  /father|mother|son|child|family|friend|guest|person|people|man|woman|official|officer|soldier|king|lord|master|gentleman|scholar/u,
  /law|rule|government|state|nation|province|district|county|capital|city|court|crime|punish|military|rank|class/u,
  /sun|moon|star|sky|wind|rain|cloud|snow|ice|fire|water|river|sea|mountain|hill|island|tree|wood|flower|leaf|animal|fish|bird|ox/u,
  /head|body|eye|ear|nose|mouth|hand|foot|heart|blood|bone|ill|disease|medicine|health|wash|bathe/u,
  /house|home|room|hall|gate|road|bridge|ship|vehicle|clothes|food|rice|oil|stone|iron|gold|paper|object|goods|tool/u,
  /year|month|day|morning|night|time|season|before|after|begin|end|first|last|east|west|south|north|place|position|distance/u,
  /one|two|three|hundred|thousand|number|count|measure|amount|many|few|half|part|divide|join|whole|round|square|shape|form/u,
  /think|mind|meaning|believe|love|respect|kind|good|evil|beautiful|bright|clear|strong|weak|right|wrong|true|false|peace/u,
  /go|come|walk|run|move|work|make|build|open|close|give|receive|hold|carry|gather|send|lead|follow|wait|change|finish/u,
];

function code(value) {
  return `U+${value.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
}

function parseUnihan(text, property) {
  const values = new Map();
  for (const line of text.split("\n")) {
    const [point, field, value] = line.split("\t");
    if (field === property) values.set(point, value);
  }
  return values;
}

function koreanMeaning(reading) {
  const first = reading.split(/[/,]/u)[0].trim().split(/\s+/u);
  first.pop();
  if (first.length === 0) throw new Error(`cannot derive sourced Korean meaning from ${reading}`);
  return first.join(" ");
}

function category(definition) {
  const normalized = definition.toLowerCase();
  const found = categories.findIndex((pattern) => pattern.test(normalized));
  return found < 0 ? categories.length : found;
}

const definitions = parseUnihan(await readFile(join(unihanDirectory, "Unihan_Readings.txt"), "utf8"), "kDefinition");
const strokes = parseUnihan(await readFile(join(unihanDirectory, "Unihan_IRGSources.txt"), "utf8"), "kTotalStrokes");
const dictionary = JSON.parse(await readFile(hanjaDictPath, "utf8"));

const characterFiles = (await readdir("data/characters")).filter((name) => name.endsWith(".json"));
const variantsByKey = new Map();
const aliasToKey = new Map();
for (const name of characterFiles) {
  const document = JSON.parse(await readFile(join("data/characters", name), "utf8"));
  for (const character of document.characters ?? []) {
    const variants = { ...(variantsByKey.get(character.key) ?? {}), ...character.variants };
    variantsByKey.set(character.key, variants);
    aliasToKey.set(character.key, character.key);
    for (const glyph of Object.values(character.variants)) {
      const existing = aliasToKey.get(glyph);
      if (existing && existing !== character.key) throw new Error(`variant ${glyph} maps to both ${existing} and ${character.key}`);
      aliasToKey.set(glyph, character.key);
    }
  }
}

const sentenceRows = [];
for (const name of ["kr-8geup.json", "kr-7geup.json"]) {
  const document = JSON.parse(await readFile(join("data/sentences", name), "utf8"));
  sentenceRows.push(...document.sentences);
}

const seenKeys = new Set();
const report = {};
for (const config of levels) {
  const source = JSON.parse(await readFile(join(gradeDirectory, config.source), "utf8"));
  const entries = source.map((row, sourceIndex) => {
    const glyph = row.prompt.normalize("NFKC");
    const key = aliasToKey.get(glyph) ?? glyph;
    if (seenKeys.has(key)) throw new Error(`duplicate generated canonical key ${key}`);
    seenKeys.add(key);
    const reading = dictionary[glyph];
    const meaningEn = definitions.get(code(glyph));
    const strokeValue = strokes.get(code(glyph));
    if (!reading || !meaningEn || !strokeValue || !/^\d+$/u.test(strokeValue)) throw new Error(`missing sourced fields for ${glyph}`);
    return {
      key,
      meaningEn,
      meaningKo: koreanMeaning(reading),
      variants: { ...(variantsByKey.get(key) ?? {}), kr: glyph },
      strokeCount: Number(strokeValue),
      tracks: [{ track: "kr", glyph, reading, level: config.level, levelOrd: config.levelOrd }],
      sourceIndex,
      category: category(meaningEn),
    };
  });
  if (entries.length !== config.sizes.reduce((total, size) => total + size, 0)) throw new Error(`${config.level} count does not match unit sizes`);
  entries.sort((left, right) => left.category - right.category || left.sourceIndex - right.sourceIndex);

  const curriculumUnits = [];
  let offset = 0;
  for (const [unitIndex, size] of config.sizes.entries()) {
    const members = entries.slice(offset, offset + size);
    offset += size;
    const titleTerms = [...new Set(members.slice(0, 2).map((entry) => entry.meaningKo))];
    curriculumUnits.push({
      track: "kr",
      level: config.level,
      ord: unitIndex + 1,
      title: `${titleTerms.join("·")} ${unitIndex + 1}`,
      subtitle: `${config.level} ${size}자`,
      members: members.map((entry, index) => ({ key: entry.key, ord: index + 1 })),
    });
  }

  const characters = entries.map((entry) => ({
    key: entry.key,
    meaningEn: entry.meaningEn,
    meaningKo: entry.meaningKo,
    variants: entry.variants,
    strokeCount: entry.strokeCount,
    tracks: entry.tracks,
  }));
  await writeFile(join("data/characters", config.output), `${JSON.stringify({ characters, curriculumUnits }, null, 2)}\n`);

  const sentences = [];
  const gaps = [];
  for (const entry of characters) {
    const glyph = entry.variants.kr;
    const candidate = sentenceRows
      .filter((sentence) => sentence.text.includes(glyph))
      .sort((left, right) => Array.from(left.text).length - Array.from(right.text).length || left.source.localeCompare(right.source))[0];
    if (!candidate) {
      gaps.push(entry.key);
      continue;
    }
    sentences.push({
      character_key: entry.key,
      track: "kr",
      text: candidate.text,
      translation_ko: candidate.translation_ko,
      source: candidate.source,
      source_kind: candidate.source_kind,
      target_index: Array.from(candidate.text).indexOf(glyph),
      rank: 0,
    });
  }
  await writeFile(join("data/sentences", config.output), `${JSON.stringify({ sentences }, null, 2)}\n`);
  report[config.level] = { characters: characters.length, sentences: sentences.length, gaps };
}

console.log(JSON.stringify(report, null, 2));
