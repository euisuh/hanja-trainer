/* global URL, URLSearchParams, console, fetch */
import { readFile, writeFile } from "node:fs/promises";

const API = "https://ko.wikisource.org/w/api.php";
const headers = { "User-Agent": "hanja-trainer-content/1.0 (https://github.com/euisuh/hanja-trainer)" };
const documents = await Promise.all([
  "data/characters/kr-8geup.json",
  "data/characters/kr-7geup.json",
].map(async (path) => JSON.parse(await readFile(path, "utf8"))));
const glyphs = documents.flatMap(({ characters }) => characters.map(({ key }) => key));

async function api(params) {
  const url = new URL(API);
  url.search = new URLSearchParams({ ...params, format: "json", formatversion: "2" });
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

function plain(line) {
  return line
    .replace(/\{\{윗주\|([^|{}]+)\|[^{}]*\}\}/gu, "$1")
    .replace(/\{\{절\|[^{}]*\}\}/gu, "")
    .replace(/<[^>]*>/gu, "")
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/gu, "$1")
    .replaceAll("[[", "")
    .replaceAll("]]", "")
    .replace(/\{\{[^{}]*\}\}/gu, "")
    .replace(/'{2,}/gu, "")
    .trim();
}

const listing = await api({
  action: "query",
  list: "allpages",
  apprefix: "개역간이국한문한글판/",
  apnamespace: "0",
  aplimit: "100",
});
const pageIds = listing.query.allpages.map(({ pageid }) => pageid);
const candidates = [];
const completeEnding = /(?:[.?!。]|다|라|요|까|냐|나|구나|도다|로다|니라|더라|지라|리라|리니|느니라|으리라|리로다|이라|이니|아멘|하매)$/u;
for (let offset = 0; offset < pageIds.length; offset += 10) {
  const result = await api({
    action: "query",
    pageids: pageIds.slice(offset, offset + 10).join("|"),
    prop: "revisions",
    rvprop: "ids|content",
    rvslots: "main",
  });
  for (const page of result.query.pages) {
    const raw = page.revisions[0].slots.main.content;
    for (const line of raw.split(/\n+/u)) {
      const text = plain(line);
      const length = Array.from(text).length;
      if (length < 6 || length > 24 || !/\p{Script=Hangul}/u.test(text) || !/\p{Script=Han}/u.test(text)) continue;
      if (/[{}<>[\]|=#]/u.test(text) || !completeEnding.test(text)) continue;
      candidates.push({ text, title: page.title, revision: page.revisions[0].revid });
    }
  }
}

const constitution = await api({
  action: "query",
  pageids: "98647",
  prop: "extracts|revisions",
  explaintext: "1",
  rvprop: "ids",
});
const constitutionPage = constitution.query.pages[0];
for (const chunk of constitutionPage.extract.split(/\n|\u3000+/u)) {
  const text = chunk.replace(/^第[一二三四五六七八九十百]+條\s*/u, "").trim();
  const length = Array.from(text).length;
  if (length < 6 || length > 24 || !/\p{Script=Hangul}/u.test(text) || !/\p{Script=Han}/u.test(text)) continue;
  if (!completeEnding.test(text)) continue;
  candidates.push({ text, title: constitutionPage.title, revision: constitutionPage.revisions[0].revid });
}

async function addPageTranscriptions(prefix, firstPage) {
  const pages = await api({
    action: "query",
    list: "allpages",
    apprefix: prefix,
    apnamespace: "250",
    aplimit: "200",
  });
  const ids = pages.query.allpages
    .filter(({ title }) => Number(title.match(/\/(\d+)$/u)?.[1]) >= firstPage)
    .map(({ pageid }) => pageid);
  for (let offset = 0; offset < ids.length; offset += 20) {
    const result = await api({
      action: "query",
      pageids: ids.slice(offset, offset + 20).join("|"),
      prop: "revisions",
      rvprop: "ids|content",
      rvslots: "main",
    });
    for (const page of result.query.pages) {
      for (const line of page.revisions[0].slots.main.content.split(/\n+/u)) {
        const text = plain(line).replace(/^:+/u, "").trim();
        const length = Array.from(text).length;
        if (length < 6 || length > 24 || !/\p{Script=Hangul}/u.test(text) || !/\p{Script=Han}/u.test(text)) continue;
        if (!completeEnding.test(text) || /[{}<>[\]|=#]/u.test(text)) continue;
        candidates.push({ text, title: page.title, revision: page.revisions[0].revid });
      }
    }
  }
}

await addPageTranscriptions("CNTS-00047778824 勞動夜學讀本. 第1- 俞吉濬(朝鮮) 著.pdf/", 9);
await addPageTranscriptions("國民小學讀本.pdf/", 9);

candidates.push(
  { text: "靑年 男子와 處女와 老人과 아이들아", title: "개역간이국한문한글판/시편", revision: 393836 },
  { text: "다만당ᄃᆞ토리업슨江山을딕히라ᄒᆞ시도다", title: "산중신곡", revision: 430664 },
  { text: "春滿한 大界에 民族的 精華를 結紐할지로다", title: "3·1독립선언서", revision: 430581 },
  { text: "國立서울大學校 內에는 左記 大學을 設置함.", title: "군정법령 제102호", revision: 456156, targets: "學校" },
  { text: "서울市는現在의區劃에따라八區로構成함", title: "군정법령 제106호", revision: 456157, targets: "市" },
  { text: "告示文의 印刷 樣式은 勞働部長이 提供함.", title: "군정법령 제112호", revision: 456159, targets: "文" },
  { text: "本 令은 公布와 同時에 有效함.", title: "군정법령 제104호", revision: 455281, targets: "有" },
  { text: "朝鮮 內의 住宅 狀態를 調査, 硏究함.", title: "군정법령 제123호", revision: 455297, targets: "住" },
  { text: "收入印紙의 額面 及 色別은 如左함.", title: "군정법령 제110호", revision: 455286, targets: "紙" },
);

const output = Object.fromEntries(glyphs.map((glyph) => [
  glyph,
  candidates.filter((candidate) => (candidate.targets ?? candidate.text).includes(glyph)),
]));
const covered = glyphs.filter((glyph) => output[glyph].length > 0);
console.log(`pages ${pageIds.length} candidates ${candidates.length} covered ${covered.length}`);
console.log(`missing ${glyphs.filter((glyph) => !covered.includes(glyph)).join("")}`);
await writeFile("/tmp/kr-candidates.json", `${JSON.stringify(output, null, 2)}\n`);

function source(candidate) {
  if (candidate.title.startsWith("개역간이국한문한글판/")) return `개역간이국한문한글판 #${candidate.revision}`;
  if (candidate.title.startsWith("대한민국헌법")) return `대한민국헌법 #${candidate.revision}`;
  if (candidate.title.startsWith("페이지:CNTS-")) return `노동야학독본 #${candidate.revision}`;
  if (candidate.title.startsWith("페이지:國民小學讀本")) return `국민 소학 독본 #${candidate.revision}`;
  return `${candidate.title} #${candidate.revision}`;
}

function score(candidate, uses) {
  const han = [...candidate.text].filter((character) => /\p{Script=Han}/u.test(character)).length;
  const preferred = candidate.title.startsWith("개역간이국한문한글판/") ? 15
    : candidate.title.startsWith("대한민국헌법") ? 12
      : 8;
  const poorContext = /子孫.*(?:名|이요)|(?:一|二|三|四|五|六|七|八|九|十|百|千|萬).*(?:名|歲)|支派|族長/u.test(candidate.text) ? 30 : 0;
  return preferred + Math.min(Array.from(candidate.text).length, 20) - han - poorContext - (uses.get(candidate.text) ?? 0) * 8;
}

const uses = new Map();
const selected = new Map();
for (const glyph of glyphs) {
  if (output[glyph].length === 0) continue;
  const candidate = output[glyph].toSorted((left, right) => score(right, uses) - score(left, uses))[0];
  selected.set(glyph, candidate);
  uses.set(candidate.text, (uses.get(candidate.text) ?? 0) + 1);
}

for (const [documentIndex, document] of documents.entries()) {
  const rows = document.characters.flatMap(({ key }) => {
    const candidate = selected.get(key);
    if (!candidate) return [];
    return [{
      character_key: key,
      track: "kr",
      text: candidate.text,
      translation_ko: candidate.text,
      source: source(candidate),
      source_kind: candidate.title.startsWith("페이지:") ? "textbook" : "corpus",
      target_index: Array.from(candidate.text).indexOf(key),
      rank: 0,
    }];
  });
  const path = documentIndex === 0 ? "data/sentences/kr-8geup.json" : "data/sentences/kr-7geup.json";
  await writeFile(path, `${JSON.stringify({ sentences: rows }, null, 2)}\n`);
  console.log(`${path} ${rows.length}`);
}
