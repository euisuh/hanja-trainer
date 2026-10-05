import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import type { SeedConversationDocument } from "../shared/types.ts";
import { applyMigrations } from "../worker/test/schema.ts";
import { emitConversationSeedSql } from "./seed.ts";
import { parseConversationSeed } from "./validate-conversation.ts";

async function sample(): Promise<SeedConversationDocument> {
  return parseConversationSeed(JSON.parse(await readFile("scripts/fixtures/conversation-sample.json", "utf8")));
}

test("conversation sample validates and seeds idempotently", async () => {
  const document = parseConversationSeed(await sample());
  const sqlite = new DatabaseSync(":memory:");
  try {
    applyMigrations(sqlite);
    const sql = emitConversationSeedSql(document);
    sqlite.exec(sql);
    const counts = sqlite.prepare(`
      SELECT
        (SELECT COUNT(*) FROM conv_units) AS units,
        (SELECT COUNT(*) FROM conv_chunks) AS chunks,
        (SELECT COUNT(*) FROM conv_scenes) AS scenes,
        (SELECT COUNT(*) FROM conv_scene_turns) AS turns
    `).get();
    sqlite.exec(sql);
    assert.deepEqual(sqlite.prepare(`
      SELECT
        (SELECT COUNT(*) FROM conv_units) AS units,
        (SELECT COUNT(*) FROM conv_chunks) AS chunks,
        (SELECT COUNT(*) FROM conv_scenes) AS scenes,
        (SELECT COUNT(*) FROM conv_scene_turns) AS turns
    `).get(), counts);
  } finally {
    sqlite.close();
  }
});

test("conversation validator rejects a missing source reference", async () => {
  const input = structuredClone(await sample());
  input.chunks[0].sourceKind = "corpus";
  assert.throws(() => parseConversationSeed(input), /sourceRef: required/);
});

test("conversation validator rejects a dead-end scene", async () => {
  const input = structuredClone(await sample());
  input.scenes[0].turns = [];
  assert.throws(() => parseConversationSeed(input), /dead-end scene/);
});

test("conversation validator rejects a missing turn target", async () => {
  const input = structuredClone(await sample());
  input.scenes[0].turns[0].chunkOrds = [99];
  assert.throws(() => parseConversationSeed(input), /missing target chunk 99/);
});

test("conversation validator rejects a chunk without kana", async () => {
  const input = structuredClone(await sample());
  input.chunks[0].kana = "";
  assert.throws(() => parseConversationSeed(input), /chunks\[0\]\.kana/);
});
