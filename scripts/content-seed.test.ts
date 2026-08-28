import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseSeed, parseSentenceSeed } from "./seed.ts";
import type { SeedSentenceEntry, Track } from "../src/shared/types.ts";

const files = {
  "data/characters/kr-8geup.json": 50,
  "data/characters/kr-7geup.json": 100,
  "data/characters/jp-kanken-10.json": 80,
  "data/characters/jp-kanken-9.json": 160,
  "data/characters/cn-hsk1.json": 246,
  "data/characters/cn-hsk2.json": 220,
};

test("curated character files validate and cross-link", async () => {
  const linked = new Map<string, Set<Track>>();
  for (const [path, expectedCount] of Object.entries(files)) {
    const document = parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown);
    assert.equal(document.characters.length, expectedCount, path);
    assert.ok(document.curriculumUnits?.every((unit) => unit.members.length >= 8 && unit.members.length <= 12), path);

    for (const character of document.characters) {
      const tracks = linked.get(character.key) ?? new Set<Track>();
      for (const entry of character.tracks) {
        tracks.add(entry.track);
        if (entry.track === "jp") {
          assert.match(entry.on, /^[\p{Script=Katakana}ー・-]+$/u, `${path}: ${character.key} on`);
          assert.match(entry.kun, /^[\p{Script=Hiragana}ー・-]+$/u, `${path}: ${character.key} kun`);
        }
        if (entry.track === "cn") assert.doesNotMatch(entry.pinyin, /\d/u, `${path}: ${character.key} pinyin`);
      }
      linked.set(character.key, tracks);
    }
  }

  assert.ok([...linked.values()].filter((tracks) => tracks.size >= 2).length >= 30);
});

test("sourced sentence files resolve to their exact target glyph", async () => {
  const glyphs = new Map<string, string>();
  const trackCounts = new Map<string, Set<Track>>();
  for (const path of Object.keys(files)) {
    for (const character of parseSeed(JSON.parse(await readFile(path, "utf8")) as unknown).characters) {
      const tracks = trackCounts.get(character.key) ?? new Set<Track>();
      for (const entry of character.tracks) {
        glyphs.set(`${character.key}:${entry.track}`, entry.glyph);
        tracks.add(entry.track);
      }
      trackCounts.set(character.key, tracks);
    }
  }

  const byIdentity = new Map<string, SeedSentenceEntry>();
  for (const path of Object.keys(files)) {
    const sentencePath = path.replace("/characters/", "/sentences/");
    const document = parseSentenceSeed(JSON.parse(await readFile(sentencePath, "utf8")) as unknown);
    for (const entry of document.sentences) {
      const glyph = glyphs.get(`${entry.characterKey}:${entry.track}`);
      assert.ok(glyph, `${sentencePath}: unknown ${entry.characterKey}:${entry.track}`);
      assert.equal(Array.from(entry.text)[entry.targetIndex], glyph, `${sentencePath}: ${entry.characterKey}`);
      assert.match(entry.source, /^Tatoeba #\d+$/u, `${sentencePath}: ${entry.characterKey}`);
      if (entry.track === "kr") {
        assert.match(entry.text, /\p{Script=Hangul}/u, `${sentencePath}: ${entry.characterKey} Hangul`);
        assert.match(entry.text, /\p{Script=Han}/u, `${sentencePath}: ${entry.characterKey} Hanja`);
      }
      const identity = `${entry.characterKey}:${entry.track}:${entry.rank}`;
      const existing = byIdentity.get(identity);
      if (existing) assert.deepEqual(entry, existing, `${sentencePath}: conflicting duplicate ${identity}`);
      byIdentity.set(identity, entry);
    }
  }

  assert.equal(byIdentity.size, 598);
  assert.equal([...glyphs].filter(([identity]) => !byIdentity.has(`${identity}:0`)).length, 164);
  for (const [key, tracks] of trackCounts) {
    if (tracks.size === 3) {
      assert.ok([...byIdentity.values()].filter((entry) => entry.characterKey === key).length >= 2, key);
    }
  }
});
