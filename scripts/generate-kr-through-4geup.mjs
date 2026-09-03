/* global console, process */
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [gradeDirectory, hanjaDictPath, unihanDirectory] = process.argv.slice(2);
if (!gradeDirectory || !hanjaDictPath || !unihanDirectory) {
  throw new Error("usage: node scripts/generate-kr-through-4geup.mjs <hanja-grade-dir> <hanjadict-table.json> <unihan-dir>");
}

const levels = [
  { source: "4.json", sourceHash: "d7ac385651a392ffe5b9b58304b9b292a64c67e0b6ef8a34dde45c1d8958eea4", officialHash: "7da078329b5d736cddf8a7002e61bfd0f2d3391a8506b267be2a3e8e25c57079", output: "kr-6geup2.json", level: "6급II", levelOrd: 4, sizes: [9, 9, 9, 8, 8, 8, 8, 8, 8] },
  { source: "5.json", sourceHash: "49467136b0d0509695adcb842db58a711f94aa86fa37c85396453608969b7191", officialHash: "ae38270c32f21ccd230a6abe3ecfdfd4a621cca989f45df7bf06fba7d50d65d9", output: "kr-6geup.json", level: "6급", levelOrd: 5, sizes: [9, 9, 9, 8, 8, 8, 8, 8, 8] },
  { source: "6.json", sourceHash: "d0c5cfb7389083cf47ad9d68a6b63a40b59a3c49ac588d55b49939964b96f1b9", officialHash: "f45666629e0302e2bc3cf1992db361077c1d968de70aa8b9934581b0d63e427b", output: "kr-5geup2.json", level: "5급II", levelOrd: 6, sizes: Array(10).fill(10) },
  { source: "7.json", sourceHash: "63ae87025bf404f0a48277b9c72778cb9f0e09b00f1cd9f994d908aff4b55352", officialHash: "acfefe938996d5c02546779cefc30a574a77cae1734f6bc15aa97e24e601362c", output: "kr-5geup.json", level: "5급", levelOrd: 7, sizes: Array(10).fill(10) },
  { source: "8.json", sourceHash: "6c7a08ab63d94291a5227269289a65b81e2abc1d695f5aa4ac55f7101c160ff1", officialHash: "fd169e3bb781c9aa6cfeb6893d06cf0404afb3b5a4738c82c02a5c56666b2a18", output: "kr-4geup2.json", level: "4급II", levelOrd: 8, sizes: Array(25).fill(10) },
  { source: "9.json", sourceHash: "7a0cc4e45abc1343486ba17c1f8685f88b28f59d741ede8d1d5048bd85b56955", officialHash: "bfcb679634056844394a40c234cd281b64ab3e9fed2f60ed127c627f812ec336", output: "kr-4geup.json", level: "4급", levelOrd: 9, sizes: Array(25).fill(10) },
];

const SOURCE_SHA256 = {
  hanjaDict: "d36ceb0d37ed53b9af78a88517ebc1499502cdef0367c396ff723460af52e471",
  readings: "575e69c9ad85a4737a889a4f94cbd987042a90a1a6cc16dd3f4ed995c715b17c",
  irg: "d1c817dd7db84295dab0643c277d97c2fa742c245f8824e6736c2a0935095325",
};

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

const [readingsText, irgText, hanjaDictText] = await Promise.all([
  readFile(join(unihanDirectory, "Unihan_Readings.txt"), "utf8"),
  readFile(join(unihanDirectory, "Unihan_IRGSources.txt"), "utf8"),
  readFile(hanjaDictPath, "utf8"),
]);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
for (const [name, text] of Object.entries({ readings: readingsText, irg: irgText, hanjaDict: hanjaDictText })) {
  if (sha256(text) !== SOURCE_SHA256[name]) throw new Error(`${name} input does not match the documented pin`);
}
const definitions = parseUnihan(readingsText, "kDefinition");
const strokes = parseUnihan(irgText, "kTotalStrokes");
const dictionary = JSON.parse(hanjaDictText);

const characterFiles = (await readdir("data/characters")).filter((name) => name.endsWith(".json"));
const sourceDocuments = await Promise.all(characterFiles.map(async (name) => [name, JSON.parse(await readFile(join("data/characters", name), "utf8"))]));
const variantsByKey = new Map();
const aliasToKey = new Map();
for (const [, document] of sourceDocuments) {
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

const seenKeys = new Set();
const report = {};
const generatedVariants = new Map();
for (const config of levels) {
  const sourceText = await readFile(join(gradeDirectory, config.source), "utf8");
  if (sha256(sourceText) !== config.sourceHash) throw new Error(`${config.source} does not match the documented grade-pack pin`);
  const source = JSON.parse(sourceText);
  const officialHash = sha256(source.map((row) => row.prompt.normalize("NFKC")).toSorted().join(""));
  if (officialHash !== config.officialHash) throw new Error(`${config.level} membership does not match the official XLS`);
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
  for (const character of characters) generatedVariants.set(character.key, character.variants);
  await writeFile(join("data/characters", config.output), `${JSON.stringify({ characters, curriculumUnits }, null, 2)}\n`);

  report[config.level] = { characters: characters.length };
}

for (const [name, document] of sourceDocuments) {
  let changed = false;
  for (const character of document.characters ?? []) {
    const variants = generatedVariants.get(character.key);
    if (!variants) continue;
    const merged = { ...character.variants, ...variants };
    if (JSON.stringify(merged) === JSON.stringify(character.variants)) continue;
    character.variants = merged;
    changed = true;
  }
  if (changed) await writeFile(join("data/characters", name), `${JSON.stringify(document, null, 2)}\n`);
}

console.log(JSON.stringify(report, null, 2));
