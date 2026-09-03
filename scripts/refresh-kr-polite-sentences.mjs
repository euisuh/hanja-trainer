/* global console, process */
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import unbzip2 from "unbzip2-stream";

const [archivePath] = process.argv.slice(2);
if (!archivePath) throw new Error("usage: node scripts/refresh-kr-polite-sentences.mjs <kor_sentences.tsv.bz2>");

const ARCHIVE_SHA256 = "6ddb636c5e598ca65c29e27c0a57e547d4854264fc594aaa1adc6af527eee095";
const selection = {
  一: 11106062, 三: 11105879, 上: 5099448, 下: 10587917, 事: 13174332, 二: 13137948,
  住: 8119523, 兄: 13131854, 入: 1015633, 內: 4952515, 八: 13206022, 前: 13143784,
  勉: 11934297, 十: 13216699, 千: 11106713, 同: 1587220, 命: 2990082, 國: 13190233,
  大: 7098211, 女: 3487223, 子: 13259272, 學: 13156007, 宗: 978656, 室: 1587175,
  家: 13187810, 少: 3947816, 山: 963697, 左: 13152276, 市: 13864722, 年: 8119471,
  弟: 10605298, 從: 11106971, 敎: 1587155, 數: 3191523, 文: 6305031, 族: 13187810,
  日: 1533099, 春: 13105958, 時: 10572142, 有: 330713, 本: 2812867, 校: 8700737,
  每: 1533099, 民: 952518, 江: 1218636, 滿: 2478242, 現: 13170403, 界: 4960669,
  的: 6289889, 稱: 1587076, 立: 12146765, 算: 1587141, 精: 8861378, 紙: 3947786,
  結: 13114035, 色: 8406161, 華: 13543050, 萬: 11106224, 記: 11105604, 部: 10585906,
  長: 13500700, 間: 11105972, 面: 11114979, 韓: 8119522,
};

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
const tsv = Buffer.concat(chunks).toString("utf8");
const corpus = new Map(tsv.trimEnd().split("\n").map((line) => {
  const [id, language, ...text] = line.split("\t");
  if (language !== "kor") throw new Error(`unexpected language ${language}`);
  return [Number(id), text.join("\t")];
}));

const seen = new Set();
for (const name of (await readdir("data/sentences")).filter((name) => name.startsWith("kr-") && name.endsWith(".json")).sort()) {
  const path = `data/sentences/${name}`;
  const document = JSON.parse(await readFile(path, "utf8"));
  for (const sentence of document.sentences) {
    const id = selection[sentence.character_key];
    const text = corpus.get(id);
    if (!id || !text) throw new Error(`no selection for ${sentence.character_key}`);
    if (Array.from(text).length > 24 || /\p{Script=Han}/u.test(text) || !/(?:요|니다|니까|세요|예요|이에요)[.!?。！？…]*$/u.test(text)) {
      throw new Error(`invalid selection for ${sentence.character_key}: ${text}`);
    }
    Object.assign(sentence, {
      text,
      translation_ko: text,
      source: `Tatoeba #${id}`,
      source_kind: "corpus",
      target_index: null,
      rank: 0,
      reading: null,
    });
    seen.add(sentence.character_key);
  }
  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`);
}
if (seen.size !== Object.keys(selection).length) throw new Error(`expected ${Object.keys(selection).length} selections, wrote ${seen.size}`);
console.log(`refreshed ${seen.size} Korean sentence mappings`);
