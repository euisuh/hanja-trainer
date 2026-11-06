/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-unknown-returns -- Test fixtures read checked-in JSON seed files; the validator under test parses them. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { applyMigrations } from "../worker/test/schema.ts";
import { emitConversationSeedSql } from "./seed.ts";
import { parseConversationSeed } from "./validate-conversation.ts";

async function unit6(): Promise<{ templates: { slots: unknown[]; jaTemplate: string; patternChunkKey: string; cueKo: string }[] }> {
  return JSON.parse(await readFile("data/conversation/unit-06.json", "utf8")) as { templates: { slots: unknown[]; jaTemplate: string; patternChunkKey: string; cueKo: string }[] };
}

test("templates seed idempotently with their slots", async () => {
  const document = parseConversationSeed(await unit6());
  const sqlite = new DatabaseSync(":memory:");
  try {
    applyMigrations(sqlite);
    const sql = emitConversationSeedSql(document);
    sqlite.exec(sql);
    sqlite.exec(sql);
    const row = sqlite.prepare("SELECT ja_template, slots, pattern_chunk_id FROM conv_templates").get() as { ja_template: string; slots: string; pattern_chunk_id: number };
    assert.equal(row.ja_template, "___はどこですか。");
    assert.equal(JSON.parse(row.slots).length, 6);
    assert.ok(row.pattern_chunk_id > 0);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM conv_templates").get() as { n: number }).n, 1);
  } finally {
    sqlite.close();
  }
});

test("validator rejects bad templates", async () => {
  const bad = async (change: (input: Awaited<ReturnType<typeof unit6>>) => void) => {
    const input = await unit6();
    change(input);
    return input;
  };
  await assert.rejects(async () => parseConversationSeed(await bad((input) => { input.templates[0].slots = input.templates[0].slots.slice(0, 3); })), /4 to 6 slots/);
  await assert.rejects(async () => parseConversationSeed(await bad((input) => { input.templates[0].jaTemplate = "はどこですか。"; })), /exactly one/);
  await assert.rejects(async () => parseConversationSeed(await bad((input) => { input.templates[0].patternChunkKey = "nope"; })), /patternChunkKey/);
  await assert.rejects(async () => parseConversationSeed(await bad((input) => { input.templates[0].cueKo = "어디냐고 묻기"; })), /\{slot\}/);
});
