/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-unknown-returns -- Test fixtures read checked-in JSON seed files; the validator under test parses them. */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { applyMigrations } from "../worker/test/schema.ts";
import { emitConversationSeedSql } from "./seed.ts";
import { parseConversationSeed } from "./validate-conversation.ts";

async function unit12(): Promise<unknown> {
  return JSON.parse(await readFile("data/conversation/unit-12.json", "utf8"));
}

test("at least four scenes use NPC variants", async () => {
  const files = (await readdir("data/conversation")).filter((name) => name.startsWith("unit-") && name.endsWith(".json"));
  let scenes = 0;
  for (const name of files) {
    const document = parseConversationSeed(JSON.parse(await readFile(`data/conversation/${name}`, "utf8")));
    scenes += document.scenes.filter((scene) => scene.turns.some((turn) => turn.variants !== undefined)).length;
  }
  assert.ok(scenes >= 4, `${scenes} scenes with variants`);
});

test("variants seed as chunk ids and the unit-12 branch is wired", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    applyMigrations(sqlite);
    sqlite.exec(emitConversationSeedSql(parseConversationSeed(await unit12())));
    const row = sqlite.prepare("SELECT variants FROM conv_scene_turns WHERE variants IS NOT NULL").get() as { variants: string };
    const variants = JSON.parse(row.variants) as { chunkId: number; replyChunkId: number }[];
    assert.equal(variants.length, 2);
    const ja = (id: number) => (sqlite.prepare("SELECT ja FROM conv_chunks WHERE id = ?").get(id) as { ja: string }).ja;
    assert.deepEqual(variants.map((variant) => [ja(variant.chunkId), ja(variant.replyChunkId)]), [
      ["かしこまりました。", "６時に４人予約したいのですが。"],
      ["何名様ですか。", "３名で予約をお願いしたいんですが。"],
    ]);
  } finally {
    sqlite.close();
  }
});

test("validator rejects malformed variants", async () => {
  const mutate = async (change: (turn: { variants?: { chunkOrd: number; replyOrd: number }[]; chunkOrds: number[]; speaker: string }, next: { chunkOrds: number[] }) => void) => {
    const input = await unit12() as { scenes: { turns: { variants?: { chunkOrd: number; replyOrd: number }[]; chunkOrds: number[]; speaker: string }[] }[] };
    const turns = input.scenes[0].turns;
    change(turns[2], turns[3]);
    return input;
  };
  await assert.rejects(async () => parseConversationSeed(await mutate((turn) => { turn.variants = [{ chunkOrd: 22, replyOrd: 4 }]; })), /expected 2 or 3 variants/);
  await assert.rejects(async () => parseConversationSeed(await mutate((turn) => { turn.chunkOrds = [22, 23, 24]; })), /chunkOrds must list exactly/);
  await assert.rejects(async () => parseConversationSeed(await mutate((_turn, next) => { next.chunkOrds = [4]; })), /is not a target of turn/);
  await assert.rejects(async () => parseConversationSeed(await mutate((_turn, next) => { next.chunkOrds = [4, 6]; (_turn as { speaker: string }).speaker = "learner"; })), /only npc turns|must reference/);
});
