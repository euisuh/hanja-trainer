/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-unknown-returns -- Test fixtures read checked-in JSON seed files; the validator under test parses them. */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import type { SeedConversationDocument } from "../shared/types.ts";
import { AUTHORED_SHARE_CAP, parseConversationSeed, validateConversationDocuments } from "./validate-conversation.ts";

async function sample(): Promise<SeedConversationDocument> {
  return parseConversationSeed(JSON.parse(await readFile("scripts/fixtures/conversation-sample.json", "utf8")));
}

test("authored rows need a reviewNote and a valid scope; npc scope is hear-only", async () => {
  const noNote = structuredClone(await sample());
  delete noNote.chunks[0].reviewNote;
  assert.throws(() => parseConversationSeed(noNote), /reviewNote/);
  const badScope = structuredClone(await sample());
  badScope.chunks[0].authoredScope = undefined;
  assert.throws(() => parseConversationSeed(badScope), /authoredScope/);
  const sayNpc = structuredClone(await sample());
  sayNpc.chunks[0].authoredScope = "npc";
  assert.throws(() => parseConversationSeed(sayNpc), /npc lines must be hear/);
});

test("validator rejects a cue that depends on a previous card", async () => {
  const input = structuredClone(await sample());
  input.chunks[0].cueKo = "같은 말을 정중하게 하기";
  assert.throws(() => parseConversationSeed(input), /must stand alone/);
});

test("authored share cap is enforced across files", async () => {
  const input = await sample();
  assert.throws(() => validateConversationDocuments([input]), /authored share/);
});

test("shipped seed stays under the authored cap", async () => {
  const files = (await readdir("data/conversation")).filter((name) => name.startsWith("unit-") && name.endsWith(".json"));
  const documents = await Promise.all(files.map(async (name) => parseConversationSeed(JSON.parse(await readFile(`data/conversation/${name}`, "utf8")))));
  validateConversationDocuments(documents);
  const keys = new Map(documents.flatMap((document) => document.chunks).map((chunk) => [chunk.key, chunk.sourceKind]));
  const authored = [...keys.values()].filter((kind) => kind === "authored").length;
  assert.ok(authored > 0 && authored <= keys.size * AUTHORED_SHARE_CAP);
});

test("spoken-register units 4 and 15 are mostly casual and annotated", async () => {
  for (const ord of [4, 15]) {
    const document = parseConversationSeed(JSON.parse(await readFile(`data/conversation/unit-${String(ord).padStart(2, "0")}.json`, "utf8")));
    const casual = document.chunks.filter((chunk) => chunk.register === "casual").length;
    assert.ok(casual >= document.chunks.length * 0.4, `unit ${ord} casual share ${casual}/${document.chunks.length}`);
    assert.ok(document.chunks.every((chunk) => chunk.noteKo !== undefined), `unit ${ord} chunk without noteKo`);
  }
});

test("every authored chunk is listed in audio-todo.json until audio exists", async () => {
  const todo = JSON.parse(await readFile("data/conversation/audio-todo.json", "utf8")) as { chunks: { audioKey: string }[] };
  const listed = new Set(todo.chunks.map((chunk) => chunk.audioKey));
  const files = (await readdir("data/conversation")).filter((name) => name.startsWith("unit-") && name.endsWith(".json"));
  for (const name of files) {
    const document = parseConversationSeed(JSON.parse(await readFile(`data/conversation/${name}`, "utf8")));
    for (const chunk of document.chunks) if (chunk.sourceKind === "authored") assert.ok(listed.has(chunk.audioKey), `${chunk.key} missing from audio-todo.json`);
  }
});
