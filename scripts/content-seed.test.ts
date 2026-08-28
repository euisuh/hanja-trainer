import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseSeed } from "./seed.ts";
import type { Track } from "../src/shared/types.ts";

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
