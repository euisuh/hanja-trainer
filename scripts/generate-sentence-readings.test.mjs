import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chineseNumber, generateSentenceReadings, readingFromTatoebaTranscription } from "./generate-sentence-readings.mjs";

test("Tatoeba transcription markup yields reviewed hiragana", () => {
  assert.equal(readingFromTatoebaTranscription("お[腹|なか][一杯|いっ|ぱい]！"), "おなかいっぱい！");
  assert.equal(readingFromTatoebaTranscription("もう[九|く][時|じ]です。"), "もうくじです。");
  assert.equal(readingFromTatoebaTranscription("[七|しち][時|じ][三|さん][十|じゅっ][分|ぷん]だった。"), "しちじさんじゅっぷんだった。");
  assert.equal(readingFromTatoebaTranscription("[灯台|とう|だい][下|もと][暗|くら]し。"), "とうだいもとくらし。");
  assert.equal(readingFromTatoebaTranscription("[外|そと]に[出|で]ろ。"), "そとにでろ。");
  assert.equal(readingFromTatoebaTranscription("ギター[弾|ひ]ける。"), "ぎたーひける。");
});

test("Arabic numbers become readable Chinese numerals", () => {
  assert.deepEqual(["3", "10", "101", "1000"].map(chineseNumber), ["三", "十", "一百零一", "一千"]);
});

test("committed readings cover reviewed regressions", async () => {
  const paths = ["jp-kanken-10.json", "jp-kanken-9.json", "jp-kanken-8.json", "cn-hsk1.json", "cn-hsk2.json"];
  const rows = (await Promise.all(paths.map(async (name) => JSON.parse(await readFile(join("data/sentences", name), "utf8")).sentences))).flat();
  const expected = new Map([
    ["私は一番です。", "わたしはいちばんです。"],
    ["もう九時です。", "もうくじです。"],
    ["トムは子供が三人います。", "とむはこどもがさんにんいます。"],
    ["手伝って下さいますか。", "てつだってくださいますか。"],
    ["咳が出ますか。", "せきがでますか。"],
    ["３角形のすべての角の和は１８０度に等しい。", "さんかくけいのすべてのかくのわはひゃくはちじゅうどにひとしい。"],
    ["木は緑色です。", "きはみどりいろです。"],
    ["新竹は風が強いため、「風の街」という美称がある。", "しんちくはかぜがつよいため、「かぜのまち」というびしょうがある。"],
    ["3点半了。", "sān diǎn bàn le。"],
    ["休息10分钟", "xiū xi shí fēn zhōng"],
    ["8月份没课。", "bā yuè fèn méi kè。"],
    ["1000日元够不够？", "yì qiān rì yuán gòu bu gòu？"],
  ]);
  for (const [text, reading] of expected) {
    const matches = rows.filter((row) => row.text === text);
    assert.ok(matches.length > 0, text);
    assert.ok(matches.every((row) => row.reading === reading), text);
  }
});

test("sentence readings generate once for every track", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hanja-readings-"));
  const path = join(directory, "sentences.json");
  try {
    await writeFile(path, JSON.stringify({ sentences: [
      { track: "kr", text: "學校에서 공부한다." },
      { track: "jp", text: "学校へ行く。" },
      { track: "cn", text: "休息10分钟" },
      { track: "jp", text: "お腹一杯！", reading: "おなかいっぱい！" },
    ] }));
    assert.equal(await generateSentenceReadings([path]), 3);
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")).sentences.map((sentence) => sentence.reading), [
      null,
      "がっこうへいく。",
      "xiū xi shí fēn zhōng",
      "おなかいっぱい！",
    ]);
    assert.equal(await generateSentenceReadings([path]), 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
