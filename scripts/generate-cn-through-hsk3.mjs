/* global console, process */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tierForTgh } from "./tgh-tier.ts";

const [hskDirectory, unihanDirectory, hanjaDictPath] = process.argv.slice(2);
if (!hskDirectory || !unihanDirectory || !hanjaDictPath) {
  throw new Error("usage: node scripts/generate-cn-through-hsk3.mjs <hsk30-checkout> <unihan-directory> <hanjadict-table.json>");
}

const HSK_COMMIT = "f3163ca6edff5d6b1e81afb1cd716bb78f5a958a";
const HSK_FILE_SHA256 = "6f48d2e8bf9e61857246a9f84c2d6ca3d3168df554be1f51fd746c30ca85ede2";
const HSK3_GLYPH_SHA256 = "86a0c935716c4714c7c8d53e8d009ab172fbf24bc33a3759855e679d18a137b0";
const SOURCE_SHA256 = {
  readings: "575e69c9ad85a4737a889a4f94cbd987042a90a1a6cc16dd3f4ed995c715b17c",
  variants: "3f23cd71872633f3350875d25bd388e83b60fa71807634c9a600ec26f38a68ab",
  irg: "d1c817dd7db84295dab0643c277d97c2fa742c245f8824e6736c2a0935095325",
  otherMappings: "4fabda168d04a5ac360809a8bfa377fe54e04fbc069ba67cacad4df03d691fa0",
  hanjaDict: "d36ceb0d37ed53b9af78a88517ebc1499502cdef0367c396ff723460af52e471",
};

const categoryPatterns = [
  /go|come|walk|run|move|work|make|open|close|send|take|receive|return|turn|stop|begin|end|choose|use|carry|change|answer|ask|help|hold|ride/u,
  /food|drink|clothes|house|room|shop|medicine|hospital|station|road|bridge|tool|box|plate|bottle|shoe|shirt|umbrella|paper/u,
  /school|study|learn|teach|book|write|read|word|speech|language|question|answer|test|grade|chapter|character|sound/u,
  /sun|moon|star|sky|wind|rain|snow|ice|fire|water|river|lake|island|mountain|tree|leaf|plant|animal|grass|flower/u,
  /year|month|day|morning|night|time|season|first|last|number|count|half|double|minute|second|degree|period/u,
  /father|mother|son|child|family|friend|guest|person|people|man|woman|aunt|uncle|member/u,
  /east|west|south|north|place|position|direction|street|town|capital|province|district|border|inside|outside/u,
  /good|evil|beautiful|bright|dark|hot|cold|deep|short|heavy|light|fast|slow|true|false|peace|pain|feeling|happy|sad/u,
  /government|state|nation|society|public|law|rule|business|industry|agriculture|festival|ceremony|culture/u,
];
const categoryTitles = ["动作", "生活与物品", "学习与语言", "自然", "数字与时间", "人与家庭", "地点与方向", "性质与状态", "社会与文化", "日常"];

function parseUnihan(text) {
  const entries = new Map();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const [codePoint, property, value] = line.split("\t");
    const glyph = String.fromCodePoint(Number.parseInt(codePoint.slice(2), 16));
    entries.set(glyph, { ...(entries.get(glyph) ?? {}), [property]: value });
  }
  return entries;
}

function variantGlyphs(value = "") {
  return [...value.matchAll(/U\+([0-9A-F]+)/gu)].map((match) => String.fromCodePoint(Number.parseInt(match[1], 16)));
}

function koreanMeaning(reading) {
  const words = reading.split(/[/,]/u)[0].trim().split(/\s+/u);
  words.pop();
  if (words.length === 0) throw new Error(`cannot derive sourced Korean meaning from ${reading}`);
  return words.join(" ");
}

function category(meanings) {
  const normalized = meanings.join(" ").toLowerCase();
  const found = categoryPatterns.findIndex((pattern) => pattern.test(normalized));
  return found < 0 ? categoryPatterns.length : found;
}

const hskPath = join(hskDirectory, "data/hsk_hanzi_compact.json");
const hskText = await readFile(hskPath, "utf8");
const [{ createHash }, readingsText, variantsText, irgText, otherMappingsText, hanjaDictText] = await Promise.all([
  import("node:crypto"),
  readFile(join(unihanDirectory, "Unihan_Readings.txt"), "utf8"),
  readFile(join(unihanDirectory, "Unihan_Variants.txt"), "utf8"),
  readFile(join(unihanDirectory, "Unihan_IRGSources.txt"), "utf8"),
  readFile(join(unihanDirectory, "Unihan_OtherMappings.txt"), "utf8"),
  readFile(hanjaDictPath, "utf8"),
]);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
if (sha256(hskText) !== HSK_FILE_SHA256) throw new Error(`hsk30 data must be pinned to ${HSK_COMMIT}`);
for (const [name, text] of Object.entries({ readings: readingsText, variants: variantsText, irg: irgText, otherMappings: otherMappingsText, hanjaDict: hanjaDictText })) {
  if (sha256(text) !== SOURCE_SHA256[name]) throw new Error(`${name} input is not the documented pin`);
}
const hanjaDict = JSON.parse(hanjaDictText);

const hskRecords = JSON.parse(hskText).data.records;
const sourceGlyphs = [...new Set(hskRecords.filter((row) => row.examLevelId === "HSK3").map((row) => row.word))];
if (hskRecords.filter((row) => row.examLevelId === "HSK3").length !== 434 || sourceGlyphs.length !== 284) {
  throw new Error("HSK3 source must contain 434 membership rows and 284 unique glyphs");
}
if (sha256(sourceGlyphs.join("")) !== HSK3_GLYPH_SHA256) throw new Error("HSK3 source membership drifted");

const readings = parseUnihan(readingsText);
const variants = parseUnihan(variantsText);
const irg = parseUnihan(irgText);
const otherMappings = parseUnihan(otherMappingsText);
const variantsByKey = new Map();
const aliasToKey = new Map();
const sourceDocuments = new Map();
for (const name of (await readdir("data/characters")).filter((candidate) => candidate.endsWith(".json") && candidate !== "cn-hsk3.json")) {
  const document = JSON.parse(await readFile(join("data/characters", name), "utf8"));
  sourceDocuments.set(name, document);
  for (const character of document.characters ?? []) {
    variantsByKey.set(character.key, { ...(variantsByKey.get(character.key) ?? {}), ...character.variants });
    aliasToKey.set(character.key, character.key);
    for (const glyph of Object.values(character.variants)) {
      const existing = aliasToKey.get(glyph);
      if (existing && existing !== character.key) throw new Error(`variant ${glyph} maps to both ${existing} and ${character.key}`);
      aliasToKey.set(glyph, character.key);
    }
  }
}

const entries = sourceGlyphs.map((glyph, sourceIndex) => {
  const traditional = variantGlyphs(variants.get(glyph)?.kTraditionalVariant);
  const key = (aliasToKey.get(glyph) ?? (traditional.length === 1 ? traditional[0] : glyph)).normalize("NFKC");
  const canonical = readings.get(key);
  const source = readings.get(glyph);
  const strokes = Number.parseInt(irg.get(key)?.kTotalStrokes, 10);
  const reading = hanjaDict[key] ?? hanjaDict[glyph];
  if (!canonical?.kDefinition || !source?.kDefinition || !source.kMandarin || !Number.isInteger(strokes) || !reading) {
    throw new Error(`missing sourced fields for ${glyph}/${key}`);
  }
  return {
    key,
    meaningEn: canonical.kDefinition.toLowerCase(),
    meaningKo: koreanMeaning(reading),
    variants: { ...(variantsByKey.get(key) ?? {}), cn: glyph },
    strokeCount: strokes,
    tracks: [{
      track: "cn",
      glyph,
      pinyin: source.kMandarin.split(" ")[0],
      meaning: source.kDefinition.toLowerCase(),
      hsk: "HSK 3",
      tier: tierForTgh(otherMappings.get(glyph)?.kTGH),
      levelOrd: 3,
    }],
    sourceIndex,
    category: category([canonical.kDefinition, source.kDefinition]),
  };
});
if (new Set(entries.map((entry) => entry.key)).size !== 284) throw new Error("HSK3 canonical keys are not unique");
entries.sort((left, right) => left.category - right.category || left.sourceIndex - right.sourceIndex);

const curriculumUnits = Array.from({ length: 29 }, (_, unitIndex) => {
  const start = Math.floor(unitIndex * entries.length / 29);
  const end = Math.floor((unitIndex + 1) * entries.length / 29);
  const members = entries.slice(start, end);
  const titles = [...new Set(members.map((entry) => categoryTitles[entry.category]))];
  return {
    track: "cn",
    level: "HSK 3",
    ord: unitIndex + 1,
    title: `${titles.join("·")} ${unitIndex + 1}`,
    subtitle: `${members.length}字`,
    members: members.map((entry, index) => ({ key: entry.key, ord: index + 1 })),
  };
});
const characters = entries.map((entry) => ({
  key: entry.key,
  meaningEn: entry.meaningEn,
  meaningKo: entry.meaningKo,
  variants: entry.variants,
  strokeCount: entry.strokeCount,
  tracks: entry.tracks,
}));
const completeVariants = new Map(characters.map((character) => [character.key, character.variants]));
for (const [name, document] of sourceDocuments) {
  let changed = false;
  for (const character of document.characters ?? []) {
    const complete = completeVariants.get(character.key);
    if (!complete) continue;
    character.variants = { ...character.variants, ...complete };
    changed = true;
  }
  if (changed) await writeFile(join("data/characters", name), `${JSON.stringify(document, null, 2)}\n`);
}

const sentenceRows = (await Promise.all(["cn-hsk1.json", "cn-hsk2.json"].map(async (name) => (
  JSON.parse(await readFile(join("data/sentences", name), "utf8")).sentences
)))).flat();
const sentences = characters.flatMap((character) => {
  const glyph = character.variants.cn;
  const candidate = sentenceRows
    .filter((sentence) => sentence.text.includes(glyph))
    .sort((left, right) => Array.from(left.text).length - Array.from(right.text).length || left.source.localeCompare(right.source))[0];
  return candidate ? [{
    character_key: character.key,
    track: "cn",
    text: candidate.text,
    translation_ko: candidate.translation_ko,
    source: candidate.source,
    source_kind: candidate.source_kind,
    target_index: Array.from(candidate.text).indexOf(glyph),
    rank: 0,
  }] : [];
});

await writeFile("data/characters/cn-hsk3.json", `${JSON.stringify({ characters, curriculumUnits }, null, 2)}\n`);
await writeFile("data/sentences/cn-hsk3.json", `${JSON.stringify({ sentences }, null, 2)}\n`);
console.log(JSON.stringify({ sourceRows: 434, sourceUnique: 284, cumulativeUnique: 655, units: curriculumUnits.length, sentences: sentences.length }));
