import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { execPath } from "node:process";
import test from "node:test";

test("Japanese generator rejects inputs outside the documented pins", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hanja-jlpt-pins-"));
  try {
    const kanji = join(directory, "kanji");
    const shinjitai = join(directory, "shinjitai");
    const hanjaDict = join(directory, "table.json");
    await mkdir(kanji);
    await mkdir(shinjitai);
    await Promise.all([
      writeFile(join(kanji, "kanji.json"), "{}"),
      writeFile(join(shinjitai, "shinjitai.json"), "{}"),
      writeFile(hanjaDict, "{}"),
    ]);
    const result = spawnSync(execPath, ["scripts/generate-jp-jlpt.mjs", kanji, shinjitai, hanjaDict], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /kanji\.json: expected SHA-256/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
