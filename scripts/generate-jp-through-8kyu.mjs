/* global console, process */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [kanjiDataDirectory, shinjitaiDirectory, hanjaDictPath] = process.argv.slice(2);
if (!kanjiDataDirectory || !shinjitaiDirectory || !hanjaDictPath) {
  throw new Error("usage: node scripts/generate-jp-through-8kyu.mjs <kanji-data-checkout> <shinjitai-table-checkout> <hanjadict-table.json>");
}

// Exact 8級 membership, transcribed row-by-row from the official 2020 級別漢字表.
const officialGrade3 = Array.from(
  "由氷湯炭真拾仕銀開悪" +
  "油表登短深終死区階安" +
  "有秒等談進習使苦寒暗" +
  "遊病動着世集始具感医" +
  "予品童注整住指君漢委" +
  "羊負農柱昔重歯係館意" +
  "洋部波丁全宿詩軽岸育" +
  "葉服配帳相所次血起員" +
  "陽福倍調送暑事決期院" +
  "様物箱追想助持研客飲" +
  "落平畑定息昭式県究運" +
  "流返発庭速消実庫急泳" +
  "旅勉反笛族商写湖級駅" +
  "両放坂鉄他章者向宮央" +
  "緑味板転打勝主幸球横" +
  "礼命皮都対乗守港去屋" +
  "列面悲度待植取号橋温" +
  "練問美投代申酒根業化" +
  "路役鼻豆第身受祭曲荷" +
  "和薬筆島題神州皿局界",
);

const categoryPatterns = [
  /go|come|walk|run|move|work|make|open|close|send|take|receive|return|turn|stop|begin|end|win|lose|play|swim|throw|ride/u,
  /food|drink|clothes|house|room|shop|medicine|hospital|station|road|bridge|tool|box|plate|oil|silver|iron|coal/u,
  /school|study|learn|teach|book|write|read|word|speech|language|poem|question|answer|research|grade|chapter/u,
  /sun|moon|star|sky|wind|rain|snow|ice|fire|water|river|lake|island|mountain|tree|leaf|plant|animal|farm/u,
  /year|month|day|morning|night|time|season|first|last|number|count|half|double|minute|second|degree|period/u,
  /father|mother|son|child|family|friend|guest|person|people|man|woman|lord|master|member|official/u,
  /east|west|south|north|place|position|direction|street|ward|town|capital|province|district|port|shore|side/u,
  /good|evil|beautiful|bright|dark|hot|cold|deep|short|heavy|light|fast|slow|true|false|peace|pain|feeling/u,
  /government|state|nation|society|public|law|rule|business|industry|agriculture|festival|ceremony|culture/u,
];
const categoryTitles = ["動き", "暮らしと物", "学びと言葉", "自然", "数と時間", "人と家族", "場所と方向", "性質と状態", "社会と文化", "日常"];

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

function category(meanings) {
  const normalized = meanings.join(" ").toLowerCase();
  const found = categoryPatterns.findIndex((pattern) => pattern.test(normalized));
  return found < 0 ? categoryPatterns.length : found;
}

const kanjiData = JSON.parse(await readFile(join(kanjiDataDirectory, "kanji.json"), "utf8"));
const shinjitai = JSON.parse(await readFile(join(shinjitaiDirectory, "shinjitai.json"), "utf8"));
const hanjaDict = JSON.parse(await readFile(hanjaDictPath, "utf8"));
const dataGrade3 = Object.entries(kanjiData).filter(([, entry]) => entry.grade === 3).map(([glyph]) => glyph);
if (officialGrade3.length !== 200 || new Set(officialGrade3).size !== 200) throw new Error("official 8級 list must contain exactly 200 unique characters");
if (dataGrade3.length !== 200 || dataGrade3.some((glyph) => !officialGrade3.includes(glyph))) {
  throw new Error("kanji-data grade 3 does not exactly match the official 8級 membership");
}

const variantsByKey = new Map();
const aliasToKey = new Map();
const sourceDocuments = new Map();
for (const name of (await readdir("data/characters")).filter((candidate) => candidate.endsWith(".json") && candidate !== "jp-kanken-8.json")) {
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

const entries = officialGrade3.map((glyph, sourceIndex) => {
  const source = kanjiData[glyph];
  const oldGlyph = (shinjitai[glyph]?.[0] ?? glyph).normalize("NFKC");
  const key = aliasToKey.get(glyph) ?? aliasToKey.get(oldGlyph) ?? oldGlyph;
  const canonicalSource = kanjiData[key];
  const reading = hanjaDict[key] ?? hanjaDict[oldGlyph] ?? hanjaDict[glyph];
  if (!source || !source.meanings?.length || !canonicalSource || !Number.isInteger(canonicalSource.strokes) || !reading) {
    throw new Error(`missing sourced fields for ${glyph}/${key}`);
  }
  const on = source.readings_on.length === 0 ? "なし" : source.readings_on.map((value) => toKatakana(value).replaceAll(".", "-")).join("・");
  const kun = source.readings_kun.length === 0 ? "なし" : source.readings_kun.map((value) => value.replaceAll(".", "-")).join("・");
  const jlpt = source.jlpt_new ?? source.jlpt_old;
  if (!Number.isInteger(jlpt) || jlpt < 1 || jlpt > 5) throw new Error(`missing JLPT mapping for ${glyph}`);
  return {
    key,
    meaningEn: source.meanings[0].toLowerCase(),
    meaningKo: koreanMeaning(reading),
    variants: { ...(variantsByKey.get(key) ?? {}), jp: glyph },
    strokeCount: canonicalSource.strokes,
    tracks: [{ track: "jp", glyph, on, kun, kanken: "8級", jlpt: `N${jlpt}`, levelOrd: 3 }],
    sourceIndex,
    category: category(source.meanings),
  };
});
if (new Set(entries.map((entry) => entry.key)).size !== 200) throw new Error("8級 canonical keys are not unique");
entries.sort((left, right) => left.category - right.category || left.sourceIndex - right.sourceIndex);

const curriculumUnits = Array.from({ length: 20 }, (_, unitIndex) => {
  const members = entries.slice(unitIndex * 10, unitIndex * 10 + 10);
  const titles = [...new Set(members.map((entry) => categoryTitles[entry.category]))];
  return {
    track: "jp",
    level: "8級",
    ord: unitIndex + 1,
    title: `${titles.join("·")} ${unitIndex + 1}`,
    subtitle: "10字",
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
    const variants = completeVariants.get(character.key);
    if (!variants) continue;
    character.variants = { ...character.variants, ...variants };
    changed = true;
  }
  if (changed) await writeFile(join("data/characters", name), `${JSON.stringify(document, null, 2)}\n`);
}
const sentenceRows = (await Promise.all(["jp-kanken-10.json", "jp-kanken-9.json"].map(async (name) => (
  JSON.parse(await readFile(join("data/sentences", name), "utf8")).sentences
)))).flat();
const sentences = characters.flatMap((character) => {
  const glyph = character.variants.jp;
  const candidate = sentenceRows
    .filter((sentence) => sentence.text.includes(glyph))
    .sort((left, right) => Array.from(left.text).length - Array.from(right.text).length || left.source.localeCompare(right.source))[0];
  return candidate ? [{
    character_key: character.key,
    track: "jp",
    text: candidate.text,
    translation_ko: candidate.translation_ko,
    source: candidate.source,
    source_kind: candidate.source_kind,
    target_index: Array.from(candidate.text).indexOf(glyph),
    rank: 0,
  }] : [];
});
await writeFile("data/characters/jp-kanken-8.json", `${JSON.stringify({ characters, curriculumUnits }, null, 2)}\n`);
await writeFile("data/sentences/jp-kanken-8.json", `${JSON.stringify({ sentences }, null, 2)}\n`);
console.log(JSON.stringify({ level: "8級", characters: characters.length, units: curriculumUnits.length, sentences: sentences.length }));
