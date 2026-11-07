import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import type { SeedConversationDocument } from "../shared/types.ts";
import { applyMigrations } from "../worker/test/schema.ts";
import { emitConversationSeedSql } from "./seed.ts";
import { parseConversationSeed, validateConversationDocuments, verifyConversationDocuments } from "./validate-conversation.ts";

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

test("conversation validator rejects undated authored content and invalid sources", async () => {
  const input = structuredClone(await sample());
  delete input.chunks[0].authoredOn;
  assert.throws(() => parseConversationSeed(input), /authoredOn/);

  const badReview = structuredClone(await sample());
  for (const bad of ["yesterday", "2026-99-99", "2026-02-30"]) {
    badReview.chunks[0].ownerReviewed = bad;
    assert.throws(() => parseConversationSeed(badReview), /ownerReviewed: expected YYYY-MM-DD/);
  }
  badReview.chunks[0].ownerReviewed = "2026-11-08";
  assert.equal(parseConversationSeed(badReview).chunks[0].ownerReviewed, "2026-11-08");
  assert.equal(parseConversationSeed(await sample()).chunks[0].ownerReviewed, undefined);

  const unsupported = {
    ...input,
    chunks: input.chunks.map((chunk, index) => index === 0
      ? { ...chunk, authoredOn: "2026-10-06", sourceKind: "unsupported" }
      : chunk),
  };
  assert.throws(() => parseConversationSeed(unsupported), /sourceKind/);

  const invalidReference = structuredClone(input);
  invalidReference.chunks[0].authoredOn = "2026-10-06";
  invalidReference.chunks[0].sourceKind = "corpus";
  invalidReference.chunks[0].sourceRef = "Tatoeba 123";
  assert.throws(() => parseConversationSeed(invalidReference), /invalid corpus reference/);
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

test("conversation validator rejects non-kana readings and scene role mismatches", async () => {
  const input = structuredClone(await sample());
  input.chunks[0].kana = input.chunks[0].text;
  assert.throws(() => parseConversationSeed(input), /expected kana and punctuation/);

  const roles = structuredClone(await sample());
  roles.scenes[0].turns[0].chunkOrds = [1];
  assert.throws(() => parseConversationSeed(roles), /npc must reference hear chunks/);
});

test("conversation validator rejects unit ord collisions across files", async () => {
  const first = await sample();
  const second = structuredClone(first);
  assert.throws(() => validateConversationDocuments([first, second]), /duplicate ord across files/);
});

test("remote verification caches Tatoeba text and source author", async () => {
  const document = await sample();
  const chunk = document.chunks[0];
  chunk.sourceKind = "corpus";
  chunk.sourceRef = "Tatoeba #123";
  const directory = await mkdtemp(join(tmpdir(), "conversation-verify-"));
  const cachePath = join(directory, ".verified.json");
  try {
    let calls = 0;
    await verifyConversationDocuments([document], async (id) => {
      calls += 1;
      assert.equal(id, "123");
      return { text: chunk.text, sourceAuthor: "fixture-owner" };
    }, cachePath);
    assert.equal(calls, 1);
    assert.deepEqual(JSON.parse(await readFile(cachePath, "utf8")), {
      123: { text: chunk.text, sourceAuthor: "fixture-owner" },
    });
    await verifyConversationDocuments([document], async () => {
      throw new Error("cache miss");
    }, cachePath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("remote verification requires exact excerpt spans", async () => {
  const document = await sample();
  const chunk = document.chunks[0];
  chunk.sourceKind = "excerpt";
  chunk.sourceRef = "Tatoeba #123 [1/2]";
  const directory = await mkdtemp(join(tmpdir(), "conversation-excerpt-"));
  const cachePath = join(directory, ".verified.json");
  try {
    await writeFile(cachePath, JSON.stringify({
      123: { text: `「${chunk.text}」「別の文。」`, sourceAuthor: "fixture-owner" },
    }));
    await verifyConversationDocuments([document], async () => {
      throw new Error("cache miss");
    }, cachePath);
    chunk.sourceRef = "Tatoeba #123 [2/2]";
    await assert.rejects(verifyConversationDocuments([document], async () => {
      throw new Error("cache miss");
    }, cachePath), /excerpt must be an exact/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
