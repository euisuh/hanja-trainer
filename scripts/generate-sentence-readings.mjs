/* global console, fetch, process */
import { Buffer } from "node:buffer";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Readable } from "node:stream";
import KuroshiroPackage from "kuroshiro";
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";
import { pinyin } from "pinyin-pro";
import unbzip2 from "unbzip2-stream";

const Kuroshiro = KuroshiroPackage.default;
const TATOEBA_TRANSCRIPTIONS = "https://downloads.tatoeba.org/exports/per_language/jpn/jpn_transcriptions.tsv.bz2";
// Tatoeba rows marked needsReview that were manually checked against standard readings.
const JP_READING_OVERRIDES = new Map([
  ["235339", "さんかくけいのすべてのかくのわはひゃくはちじゅうどにひとしい。"],
  ["13541053", "きはみどりいろです。"],
  ["13545832", "しんちくはかぜがつよいため、「かぜのまち」というびしょうがある。"],
]);

function toHiragana(value) {
  return value.replace(/[\u30a1-\u30f6]/gu, (character) => String.fromCodePoint(character.codePointAt(0) - 0x60));
}

export function readingFromTatoebaTranscription(value) {
  return toHiragana(value.replace(/\[([^\]]+)\]/gu, (_, annotation) => {
    const [surface, ...reading] = annotation.split("|");
    return reading.join("") || surface;
  }));
}

export function chineseNumber(value) {
  const digits = "零一二三四五六七八九";
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > 9999) return Array.from(value, (digit) => digits[Number(digit)]).join("");
  if (number < 10) return digits[number];
  let result = "";
  let pendingZero = false;
  for (const [divisor, unit] of [[1000, "千"], [100, "百"], [10, "十"], [1, ""]]) {
    const digit = Math.floor(number / divisor) % 10;
    if (digit === 0) {
      if (result && number % divisor) pendingZero = true;
      continue;
    }
    if (pendingZero) result += "零";
    if (!(divisor === 10 && digit === 1 && result === "")) result += digits[digit];
    result += unit;
    pendingZero = false;
  }
  return result;
}

async function tatoebaReadings(ids) {
  if (ids.size === 0) return new Map();
  const response = await fetch(TATOEBA_TRANSCRIPTIONS);
  if (!response.ok || !response.body) throw new Error(`Tatoeba transcriptions: HTTP ${response.status}`);
  const chunks = [];
  const stream = Readable.fromWeb(response.body).pipe(unbzip2());
  await new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  const readings = new Map();
  for (const line of Buffer.concat(chunks).toString("utf8").split("\n")) {
    const [id, , script, , transcription] = line.split("\t");
    if (script === "Hrkt" && ids.has(id)) readings.set(id, readingFromTatoebaTranscription(transcription));
  }
  for (const [id, reading] of JP_READING_OVERRIDES) if (ids.has(id)) readings.set(id, reading);
  return readings;
}

export async function generateSentenceReadings(paths, { force = false } = {}) {
  const files = paths ?? (await readdir("data/sentences"))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => join("data/sentences", name));
  const documents = await Promise.all(files.map(async (path) => ({ path, value: JSON.parse(await readFile(path, "utf8")) })));
  const pending = documents.flatMap(({ path, value }) => value.sentences
    .filter((sentence) => force || (sentence.track === "kr" ? sentence.reading !== null : typeof sentence.reading !== "string" || !sentence.reading.trim()))
    .map((sentence) => ({ path, sentence })));
  const tatoebaIds = new Set(pending.flatMap(({ sentence }) => {
    const match = sentence.track === "jp" && sentence.source?.match(/^Tatoeba #(\d+)$/u);
    return match ? [match[1]] : [];
  }));
  const sourceReadings = await tatoebaReadings(tatoebaIds);
  let kuroshiro;
  const cache = new Map();
  let changed = 0;

  for (const { path, value: document } of documents) {
    for (const { sentence } of pending.filter((entry) => entry.path === path)) {
      const cacheKey = `${sentence.track}:${sentence.source}:${sentence.text}`;
      let reading = cache.get(cacheKey);
      if (reading === undefined) {
        if (sentence.track === "kr") reading = null;
        else if (sentence.track === "jp") {
          const id = sentence.source?.match(/^Tatoeba #(\d+)$/u)?.[1];
          reading = sourceReadings.get(id);
          if (!reading) {
            if (!kuroshiro) {
              kuroshiro = new Kuroshiro();
              await kuroshiro.init(new KuromojiAnalyzer());
            }
            reading = await kuroshiro.convert(sentence.text, { to: "hiragana" });
          }
        } else if (sentence.track === "cn") reading = pinyin(sentence.text.replace(/\d+/gu, chineseNumber), { toneType: "symbol", nonZh: "consecutive" })
          .replace(/\s+([,.!?;:\u3001\u3002\uff01\uff0c\uff1a\uff1b\uff1f\uff09\u3011\u300b])/gu, "$1")
          .replace(/([\uff08\u3010\u300a])\s+/gu, "$1");
        else throw new Error(`${path}: unknown track ${sentence.track}`);
        cache.set(cacheKey, reading);
      }
      if (sentence.reading !== reading) {
        sentence.reading = reading;
        changed += 1;
      }
    }
    if (pending.some((entry) => entry.path === path)) await writeFile(path, `${JSON.stringify(document, null, 2)}\n`);
  }
  return changed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const paths = args.filter((arg) => arg !== "--force");
  generateSentenceReadings(paths.length ? paths : undefined, { force })
    .then((changed) => console.log(JSON.stringify({ changed })))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
