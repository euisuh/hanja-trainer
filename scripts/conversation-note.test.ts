import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { applyMigrations } from "../worker/test/schema.ts";
import { emitConversationSeedSql } from "./seed.ts";
import { parseConversationSeed } from "./validate-conversation.ts";

async function sample(): Promise<ReturnType<typeof parseConversationSeed>> {
  return parseConversationSeed(JSON.parse(await readFile("scripts/fixtures/conversation-sample.json", "utf8")));
}

test("noteKo is optional, capped at 80 characters, and seeded", async () => {
  const input = structuredClone(await sample());
  input.chunks[0].noteKo = "は는 주제, が는 새 정보를 가리킵니다.";
  assert.equal(parseConversationSeed(input).chunks[0].noteKo, input.chunks[0].noteKo);
  const sqlite = new DatabaseSync(":memory:");
  try {
    applyMigrations(sqlite);
    sqlite.exec(emitConversationSeedSql(parseConversationSeed(input)));
    assert.deepEqual({ ...sqlite.prepare("SELECT note_ko FROM conv_chunks WHERE key = ?").get(input.chunks[0].key) }, { note_ko: input.chunks[0].noteKo });
  } finally {
    sqlite.close();
  }
  input.chunks[0].noteKo = "가".repeat(81);
  assert.throws(() => parseConversationSeed(input), /noteKo: at most 80/);
});
