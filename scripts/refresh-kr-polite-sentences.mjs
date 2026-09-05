/* global console, process */
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import unbzip2 from "unbzip2-stream";

const [archivePath] = process.argv.slice(2);
if (!archivePath) throw new Error("usage: node scripts/refresh-kr-polite-sentences.mjs <kor_sentences.tsv.bz2>");

const ARCHIVE_SHA256 = "6ddb636c5e598ca65c29e27c0a57e547d4854264fc594aaa1adc6af527eee095";
const exceptions = new Map([
  ["從", { id: 11106971, rule: "훈", token: "따라오세요", note: "좇다와 같은 따라가다의 뜻" }],
  ["稱", { id: 1587076, rule: "훈", token: "부르세요", note: "일컫다와 같은 부르다의 뜻" }],
  ["滿", { id: 2478242, rule: "훈", token: "가득", note: "차서 가득한 상태" }],
  ["精", { id: 8861378, rule: "한자어", token: "정신", hanja: "精神" }],
  ["宗", { id: 978656, rule: "한자어", token: "종교", hanja: "宗教" }],
  ["結", { id: 13114035, rule: "한자어", token: "결혼", hanja: "結婚" }],
  ["的", { id: 6289889, rule: "한자어", token: "목적", hanja: "目的" }],
  ["族", { id: 13187810, rule: "한자어", token: "가족", hanja: "家族" }],
  ["本", { id: 13661161, rule: "한자어", token: "일본", hanja: "日本" }],
  ["現", { id: 13170403, rule: "한자어", token: "현재", hanja: "現在" }],
  ["部", { id: 10585906, rule: "한자어", token: "부서", hanja: "部署" }],
  ["江", { id: 1218636, rule: "음", token: "강물", reading: "강", note: "강물의 강" }],
  ["內", { id: 4952515, rule: "훈", token: "안에", note: "안쪽의 뜻" }],
  ["立", { id: 12146765, rule: "훈", token: "서 있어요", note: "서다의 활용" }],
  ["每", { id: 1533099, rule: "한자어", token: "매일", hanja: "每日" }],
  ["事", { id: 13174332, rule: "훈", token: "일이에요", note: "일 또는 사건의 뜻" }],
  ["上", { id: 5099448, rule: "훈", token: "위에", note: "위쪽의 뜻" }],
  ["前", { id: 13143784, rule: "훈", token: "앞은", note: "앞쪽의 뜻" }],
  ["左", { id: 13152276, rule: "훈", token: "왼쪽", note: "왼쪽의 뜻" }],
  ["下", { id: 10587917, rule: "훈", token: "내려가세요", note: "아래로 가다의 뜻" }],
  ["同", { id: 1587220, rule: "한자어", token: "동감", hanja: "同感" }],
  ["面", { id: 11114979, rule: "훈", token: "얼굴", note: "낯 또는 얼굴의 뜻" }],
  ["命", { id: 2990082, rule: "훈", token: "삶", note: "목숨 또는 생명의 뜻" }],
  ["算", { id: 1587141, rule: "한자어", token: "계산", hanja: "計算" }],
  ["色", { id: 8406161, rule: "음", token: "색은", reading: "색", note: "빛깔을 뜻하는 색" }],
  ["少", { id: 3947816, rule: "훈", token: "조금", note: "적은 양의 뜻" }],
  ["數", { id: 3191523, rule: "한자어", token: "수학", hanja: "數學" }],
  ["有", { id: 330713, rule: "훈", token: "있어요", note: "존재하다의 뜻" }],
  ["入", { id: 1015633, rule: "한자어", token: "입장", hanja: "入場" }],
  ["住", { id: 8119523, rule: "훈", token: "살고", note: "거주하며 살다의 뜻" }],
  ["紙", { id: 3947786, rule: "훈", token: "종이", note: "종이의 뜻" }],
  ["千", { id: 11106713, rule: "수", token: "1000", note: "일천의 수값" }],
  ["春", { id: 13105958, rule: "훈", token: "봄", note: "봄의 뜻" }],
  ["年", { id: 8119471, rule: "한자어", token: "내년", hanja: "來年" }],
  ["大", { id: 7098211, rule: "한자어", token: "대학생", hanja: "大學生" }],
  ["萬", { id: 11106224, rule: "수", token: "만 엔", note: "일만의 수값" }],
  ["民", { id: 952518, rule: "한자어", token: "주민", hanja: "住民" }],
  ["山", { id: 963697, rule: "음", token: "산이", reading: "산", note: "산의 뜻" }],
  ["三", { id: 11105879, rule: "수", token: "셋", note: "석 삼의 수값" }],
  ["室", { id: 1587175, rule: "훈", token: "방은", note: "방 또는 집의 뜻" }],
  ["十", { id: 13216699, rule: "한자어", token: "오십", hanja: "五十" }],
  ["二", { id: 13137948, rule: "수", token: "두 개", note: "두 이의 수값" }],
  ["一", { id: 11106062, rule: "수", token: "하나", note: "한 일의 수값" }],
  ["日", { id: 1533099, rule: "한자어", token: "매일", hanja: "每日" }],
  ["長", { id: 11114977, rule: "훈", token: "긴 연설", note: "길다의 활용이며 길 도로와 구별" }],
  ["弟", { id: 10605298, rule: "훈", token: "동생", note: "아우 또는 어린 형제의 뜻" }],
  ["八", { id: 13206022, rule: "수", token: "8년", note: "여덟의 수값" }],
  ["兄", { id: 13131854, rule: "한자어", token: "형제", hanja: "兄弟" }],
]);
const isPolite = (text) => {
  const ending = text.replace(/[.!?。！？…]+$/u, "");
  if (ending.endsWith("요")) return true;
  if (!/니(?:다|까)$/u.test(ending)) return false;
  const previous = Array.from(ending.slice(0, -2)).at(-1)?.codePointAt(0) ?? 0;
  return previous >= 0xac00 && previous <= 0xd7a3 && (previous - 0xac00) % 28 === 17;
};
const startsHangulWord = (text, token) => (text.match(/\p{Script=Hangul}+/gu) ?? []).some((word) => word.startsWith(token));
const eumsForReading = (reading) => [...new Set(reading.split(",").flatMap((part) => part.split("/")).flatMap((part) => (
  part.trim().split(/\s+/u).at(-1)?.match(/[가-힣]+/gu) ?? []
)))];

const archive = await readFile(archivePath);
if (createHash("sha256").update(archive).digest("hex") !== ARCHIVE_SHA256) {
  throw new Error("Korean Tatoeba export does not match the documented pin");
}
const chunks = [];
const stream = Readable.from([archive]).pipe(unbzip2());
await new Promise((resolve, reject) => {
  stream.on("data", (chunk) => chunks.push(chunk));
  stream.on("end", resolve);
  stream.on("error", reject);
});
const corpus = Buffer.concat(chunks).toString("utf8").trimEnd().split("\n").map((line) => {
  const [rawId, language, ...rest] = line.split("\t");
  if (language !== "kor") throw new Error(`unexpected language ${language}`);
  const text = rest.join("\t");
  return { id: Number(rawId), text, length: Array.from(text).length };
});
const corpusById = new Map(corpus.map((sentence) => [sentence.id, sentence]));
const candidates = corpus.filter(({ text, length }) => (
  length <= 24
  && /\p{Script=Hangul}/u.test(text)
  && !/\p{Script=Han}/u.test(text)
  && isPolite(text)
)).sort((left, right) => left.length - right.length || left.id - right.id);

const words = JSON.parse(await readFile("data/words/kr-wiktionary.json", "utf8")).words;
const wordsByCharacter = new Map();
for (const word of words) {
  for (const key of word.members) wordsByCharacter.set(key, [...(wordsByCharacter.get(key) ?? []), word]);
}
for (const entries of wordsByCharacter.values()) entries.sort((left, right) => left.reading.localeCompare(right.reading, "ko") || left.glyph.localeCompare(right.glyph));

const characterNames = (await readdir("data/characters"))
  .filter((name) => name.startsWith("kr-") && name.endsWith(".json"))
  .sort();
const files = await Promise.all(characterNames.map(async (name) => ({
  name,
  document: JSON.parse(await readFile(`data/characters/${name}`, "utf8")),
})));
const characters = files.flatMap(({ name, document }) => document.characters.map((character) => {
  const reading = character.tracks.find((track) => track.track === "kr")?.reading;
  if (!reading) throw new Error(`${name}: no Korean reading for ${character.key}`);
  return { ...character, eums: eumsForReading(reading) };
}));

const candidateCounts = new Map(characters.map((character) => {
  const attestations = wordsByCharacter.get(character.key) ?? [];
  return [character.key, candidates.filter(({ text }) => attestations.some(({ reading }) => startsHangulWord(text, reading))).length];
}));
const selected = new Map(characters.flatMap((character) => {
  const attestations = wordsByCharacter.get(character.key) ?? [];
  const candidate = candidates.find(({ text }) => attestations.some(({ reading }) => startsHangulWord(text, reading)));
  if (candidate) {
    const attestation = attestations.find(({ reading }) => startsHangulWord(candidate.text, reading));
    return [[character.key, { ...candidate, rule: "sourced compound", token: attestation.reading, attestation }]];
  }
  const exception = exceptions.get(character.key);
  if (!exception) return [];
  const sentence = corpusById.get(exception.id);
  if (!sentence || !candidates.some(({ id }) => id === exception.id) || !sentence.text.includes(exception.token)) {
    throw new Error(`invalid ${exception.rule} exception for ${character.key}`);
  }
  if (!["훈", "음", "수", "한자어"].includes(exception.rule)) throw new Error(`unknown exception rule for ${character.key}`);
  if (exception.rule === "한자어" && (!/^\p{Script=Han}+$/u.test(exception.hanja ?? "") || !exception.hanja.includes(character.key))) {
    throw new Error(`invalid 한자어 exception for ${character.key}`);
  }
  if (exception.rule !== "한자어" && !exception.note) throw new Error(`missing exception note for ${character.key}`);
  if (exception.rule === "음" && (!character.eums.includes(exception.reading) || !exception.token.includes(exception.reading))) {
    throw new Error(`invalid 음 exception for ${character.key}`);
  }
  return [[character.key, { ...sentence, ...exception }]];
}));
const usedExceptions = [...selected].filter(([key, selection]) => exceptions.has(key) && selection.rule !== "sourced compound");
if (usedExceptions.length !== exceptions.size) throw new Error(`expected ${exceptions.size} reviewed exceptions, used ${usedExceptions.length}`);

for (const { name, document } of files) {
  const sentences = document.characters.flatMap((character) => {
    const selection = selected.get(character.key);
    if (!selection) return [];
    return [{
      character_key: character.key,
      track: "kr",
      text: selection.text,
      translation_ko: selection.text,
      source: `Tatoeba #${selection.id}`,
      source_kind: "corpus",
      target_index: null,
      rank: 0,
      reading: null,
    }];
  });
  await writeFile(`data/sentences/${name}`, `${JSON.stringify({ sentences }, null, 2)}\n`);
}

const gaps = characters.filter(({ key }) => !selected.has(key)).map(({ key }) => key).sort();
const counts = [...candidateCounts.values()].toSorted((left, right) => left - right);
const percentile = (value) => counts[Math.floor((counts.length - 1) * value)];
const buckets = [
  `0=${counts.filter((count) => count === 0).length}`,
  `1-9=${counts.filter((count) => count >= 1 && count <= 9).length}`,
  `10-99=${counts.filter((count) => count >= 10 && count <= 99).length}`,
  `100+=${counts.filter((count) => count >= 100).length}`,
].join(", ");
const coverage = selected.size;
const sourcedCount = coverage - usedExceptions.length;
const rankZeroCount = 711 + coverage;
const identityCount = rankZeroCount + 1;
const exceptionRows = usedExceptions.map(([key, selection]) => {
  const justification = selection.rule === "한자어" ? `${selection.token} (${selection.hanja})` : selection.note;
  return `| ${key} | ${selection.rule} | \`${selection.token}\` | Tatoeba #${selection.id} | ${justification} |`;
}).join("\n");
const gapRows = gaps.map((key) => `| ${key} | No qualifying row contains an attested compound, and no reviewed exception applies. |`).join("\n");
const koreanSection = `## Korean modern polite lane

Issue #156 adopts the issue #150 decision to relax the literal-glyph rule only
for Korean. The official per-language
[Korean Tatoeba export](https://downloads.tatoeba.org/exports/per_language/kor/kor_sentences.tsv.bz2)
was retrieved 2026-09-02. It contains ${corpus.length.toLocaleString("en-US")} rows and has SHA-256
\`${ARCHIVE_SHA256}\`. The export is covered by the Tatoeba license and
attribution terms above.

\`scripts/refresh-kr-polite-sentences.mjs\` verifies that frozen-export hash,
then searches all ${candidates.length.toLocaleString("en-US")} rows containing Hangul, no Han code point, at most
24 Unicode code points, and a polite \`-요\` or \`-습니다\`-family ending. A
normal mapping must contain, at the start of a Hangul word, the complete
reading of a two-character compound in \`data/words/kr-wiktionary.json\`, and
that sourced compound must list the target character as a member. Shortest
sentence and then lowest Tatoeba id break ties. Matching a bare 음 syllable is intentionally
insufficient because native words and homophones do not identify a Hanja.

${sourcedCount} mappings use the sourced-compound rule. ${usedExceptions.length} further mappings use the
reviewed exceptions below: an exact frozen Tatoeba id and token plus an
explicit 한자어 spelling, 훈 meaning, 음 context, or numeric value. The script
validates every exception before writing. Duplicate Tatoeba ids are allowed
only when every character independently passes one of these rules; a session
may consequently repeat a sentence.

Every row records its \`Tatoeba #{id}\` attribution and uses
\`source_kind: corpus\`, \`target_index: null\`, and \`reading: null\`.
\`translation_ko\` equals the unmodified Korean source text. Korean coverage
is ${coverage} of ${characters.length} characters. Japanese and Chinese retain the literal-glyph
offset contract unchanged. Across all tracks, ${rankZeroCount.toLocaleString("en-US")} of 3,866 pairs have rank-0
sentences; one extra rank makes ${identityCount.toLocaleString("en-US")} unique seeded sentence identities.

### Reviewed Korean exceptions

| Character | Rule | Token | Source | Justification |
| --- | --- | --- | --- | --- |
${exceptionRows}

### Remaining Korean gaps

${gaps.length} characters have no qualifying row under the frozen corpus and
mapping rule.

| Character | Reason |
| --- | --- |
${gapRows}

`;
const sources = await readFile("data/SOURCES.md", "utf8");
const sectionStart = sources.indexOf("## Korean modern polite lane");
const sectionEnd = sources.indexOf("## Past-paper sourcing position");
if (sectionStart < 0 || sectionEnd < 0 || sectionEnd <= sectionStart) throw new Error("Korean source ledger section not found");
await writeFile("data/SOURCES.md", `${sources.slice(0, sectionStart)}${koreanSection}${sources.slice(sectionEnd)}`);

console.log(`qualifying corpus rows: ${candidates.length}/${corpus.length}`);
console.log(`sourced-compound candidate counts: ${buckets}; min=${percentile(0)}, p25=${percentile(0.25)}, median=${percentile(0.5)}, p75=${percentile(0.75)}, p90=${percentile(0.9)}, max=${percentile(1)}`);
console.log(`refreshed ${coverage}/${characters.length} Korean mappings: ${sourcedCount} sourced compounds + ${usedExceptions.length} reviewed exceptions; ${gaps.length} gaps remain`);
