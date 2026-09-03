/* global console, fetch */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { URL } from "node:url";

const API = "https://api.tatoeba.org/v1/sentences";
const MAX_LENGTH = 24;
const TRACKS = {
  jp: {
    language: "jpn",
    queries: ["です", "ます"],
    polite: (text) => /(?:です|でし(?:た|ょう)|ます|まし(?:た|ょう)|ません(?:でした)?)(?:[。！？!?]|よ|ね|か)*$/u.test(text),
    valid: (text) => !/\p{Number}/u.test(text),
  },
  cn: {
    language: "cmn",
    queries: ["您"],
    polite: (text) => text.includes("您"),
    script: "Hans",
  },
};

function length(text) {
  return Array.from(text).length;
}

function koreanPolite(text) {
  return /(?:요|니다|니까|세요|예요|이에요)[.!?。！？]*$/u.test(text);
}

function translation(sentence) {
  return sentence.translations
    .filter((candidate) => candidate.lang === "kor" && /\p{Script=Hangul}/u.test(candidate.text))
    .sort((left, right) => Number(koreanPolite(right.text)) - Number(koreanPolite(left.text))
      || Number(right.is_direct) - Number(left.is_direct)
      || length(left.text) - length(right.text)
      || left.id - right.id)[0];
}

async function search(language, query) {
  const url = new URL(API);
  for (const [key, value] of Object.entries({
    lang: language,
    q: query,
    "trans:lang": "kor",
    is_unapproved: "no",
    "trans:is_unapproved": "no",
    sort: "words",
    limit: "50",
  })) url.searchParams.set(key, value);

  const sentences = [];
  let next = url.href;
  while (next) {
    const response = await fetch(next);
    if (!response.ok) throw new Error(`Tatoeba ${language}/${query}: HTTP ${response.status}`);
    const page = await response.json();
    sentences.push(...page.data);
    next = page.paging.has_next ? page.paging.next : "";
  }
  return sentences;
}

async function candidatePool({ language, queries, polite, script, valid = () => true }) {
  const byId = new Map();
  for (const sentence of (await Promise.all(queries.map((query) => search(language, query)))).flat()) {
    const korean = translation(sentence);
    if (korean && (!script || sentence.script === script) && valid(sentence.text) && polite(sentence.text) && length(sentence.text) <= MAX_LENGTH) {
      byId.set(sentence.id, { ...sentence, korean });
    }
  }
  return [...byId.values()];
}

for (const [track, rule] of Object.entries(TRACKS)) {
  const pool = await candidatePool(rule);
  const files = (await readdir("data/sentences")).filter((name) => name.startsWith(`${track}-`) && name.endsWith(".json")).sort();
  let changed = 0;
  let polite = 0;
  let unchanged = 0;

  for (const name of files) {
    const path = join("data/sentences", name);
    const document = JSON.parse(await readFile(path, "utf8"));
    for (const sentence of document.sentences) {
      if (rule.polite(sentence.text)) {
        polite += 1;
        continue;
      }
      const glyph = Array.from(sentence.text)[sentence.target_index];
      const candidate = pool
        .filter((entry) => entry.text.includes(glyph))
        .sort((left, right) => length(left.text) - length(right.text)
          || Number(koreanPolite(right.korean.text)) - Number(koreanPolite(left.korean.text))
          || Number(right.korean.is_direct) - Number(left.korean.is_direct)
          || length(left.korean.text) - length(right.korean.text)
          || left.id - right.id)[0];
      if (!candidate) {
        unchanged += 1;
        continue;
      }
      sentence.text = candidate.text;
      sentence.translation_ko = candidate.korean.text;
      sentence.source = `Tatoeba #${candidate.id}`;
      sentence.source_kind = "corpus";
      sentence.target_index = Array.from(candidate.text).indexOf(glyph);
      delete sentence.reading;
      changed += 1;
      polite += 1;
    }
    await writeFile(path, `${JSON.stringify(document, null, 2)}\n`);
  }
  console.log(JSON.stringify({ track, candidates: pool.length, changed, polite, unchanged }));
}
