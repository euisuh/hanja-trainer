/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/require-safety-comment-for-type-assertion -- SQLite D1 adapter mirrors neighboring Worker API fixture tests. */
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { emitConversationSeedSql } from "../../scripts/seed.ts";
import { parseConversationSeed } from "../../scripts/validate-conversation.ts";
import { applyMigrations } from "../test/schema";
import { getConversationProgress, getConversationSession, getDueConversationChunks } from "./conversation";
import { submitConversationAttempt } from "./conversationAttempts";

function result<T>(results: T[]): D1Result<T> {
  return { results, success: true, meta: { duration: 0, size_after: 0, rows_read: 0, rows_written: 0, last_row_id: 0, changed_db: false, changes: 0 } };
}

function d1(sqlite: DatabaseSync): D1Database {
  const database = Object.create(null) as D1Database;
  database.prepare = (query: string) => {
    let values: SQLInputValue[] = [];
    const statement = Object.create(null) as D1PreparedStatement;
    statement.bind = (...bound: unknown[]) => {
      values = bound as SQLInputValue[];
      return statement;
    };
    statement.all = async <T>() => result(sqlite.prepare(query).all(...values) as T[]);
    statement.first = async <T>() => (sqlite.prepare(query).get(...values) as T | undefined) ?? null;
    statement.run = async <T>() => {
      sqlite.prepare(query).run(...values);
      return result<T>([]);
    };
    return statement;
  };
  database.batch = async <T>(statements: D1PreparedStatement[]) => Promise.all(statements.map((statement) => statement.run<T>()));
  return database;
}

const databases: DatabaseSync[] = [];
afterEach(() => { for (const sqlite of databases.splice(0)) sqlite.close(); });

// The seed script is the only writer of conv_chunks in production. After migration 0027 it leaves
// conv_chunks.unit_id NULL and records unit membership in conv_unit_chunks, so read paths must join that.
function seededDatabase(): DatabaseSync {
  const sqlite = new DatabaseSync(":memory:");
  databases.push(sqlite);
  applyMigrations(sqlite);
  sqlite.exec(emitConversationSeedSql(parseConversationSeed(JSON.parse(readFileSync("scripts/fixtures/conversation-sample.json", "utf8")))));
  return sqlite;
}

describe("conversation reads and writes against seed-shaped data", () => {
  it("counts each unit's say phrases in progress", async () => {
    const sqlite = seededDatabase();
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM conv_chunks WHERE unit_id IS NOT NULL").get()).toEqual({ n: 0 });
    const progress = await getConversationProgress(d1(sqlite), 1);
    expect(progress.units).toHaveLength(1);
    expect(progress.units[0]?.phraseCount).toBe(3);
    expect(progress.phrases).toHaveLength(3);
    expect(progress.phrases.every((phrase) => phrase.unitId === progress.units[0]?.id)).toBe(true);
  });

  it("serves a session with chunk items", async () => {
    const sqlite = seededDatabase();
    const unitId = Number((sqlite.prepare("SELECT id FROM conv_units").get() as { id: number }).id);
    const session = await getConversationSession(d1(sqlite), 1, unitId);
    expect(session?.chunks.length).toBeGreaterThan(0);
    expect(session?.items.some((item) => item.kind === "chunk")).toBe(true);
  });

  it("serves a slot drill in the session and grades it into per-template FSRS state", async () => {
    const sqlite = new DatabaseSync(":memory:");
    databases.push(sqlite);
    applyMigrations(sqlite);
    sqlite.exec(emitConversationSeedSql(parseConversationSeed(JSON.parse(readFileSync("data/conversation/unit-05.json", "utf8")))));
    const unitId = Number((sqlite.prepare("SELECT id FROM conv_units").get() as { id: number }).id);
    const now = 1_800_000_000_000;
    const session = await getConversationSession(d1(sqlite), 1, unitId, now);
    const drills = session?.items.filter((item) => item.kind === "drill") ?? [];
    expect(drills).toHaveLength(1);
    expect(session?.items.at(-1)?.kind).toBe("scene");
    const drill = drills[0];
    if (drill?.kind !== "drill") throw new Error("drill missing");
    expect(drill.template.key).toBe("tpl-o-kudasai");
    expect(drill.template.slots.length).toBeGreaterThanOrEqual(4);

    await expect(submitConversationAttempt(d1(sqlite), 1, {
      clientAttemptId: "drill-1", chunkId: drill.template.patternChunkId, templateId: drill.template.id, role: "say", grade: "good", answeredAt: now, loop: "drill", input: "tap",
    }, new Date(now))).resolves.toEqual({ grade: "good" });
    // The test D1 adapter reports changes: 0 for batch writes, which triggers the conflict retry, so reps may be 2 here.
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM conv_template_states WHERE profile_id = 1 AND template_id = ? AND reps >= 1").get(drill.template.id)).toEqual({ n: 1 });
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM conv_chunk_states").get()).toEqual({ n: 0 });
    const after = await getConversationSession(d1(sqlite), 1, unitId, now);
    expect(after?.items.some((item) => item.kind === "drill")).toBe(false);
    await expect(submitConversationAttempt(d1(sqlite), 1, {
      clientAttemptId: "drill-2", chunkId: drill.template.patternChunkId + 1, templateId: drill.template.id, role: "say", grade: "good", answeredAt: now, loop: "drill",
    }, new Date(now))).rejects.toThrow();
  });

  it("rotates to the next unseen scene after one is practiced", async () => {
    const sqlite = new DatabaseSync(":memory:");
    databases.push(sqlite);
    applyMigrations(sqlite);
    sqlite.exec(emitConversationSeedSql(parseConversationSeed(JSON.parse(readFileSync("data/conversation/unit-05.json", "utf8")))));
    const unitId = Number((sqlite.prepare("SELECT id FROM conv_units").get() as { id: number }).id);
    const chunk = sqlite.prepare("SELECT id FROM conv_chunks WHERE key = 'tatoeba-224884-say'").get() as { id: number };
    const sceneOrds: number[] = [];
    for (let round = 0; round < 4; round += 1) {
      const session = await getConversationSession(d1(sqlite), 1, unitId, 1_800_000_000_000 + round);
      const scene = session?.items.at(-1);
      if (scene?.kind !== "scene") throw new Error("scene missing");
      sceneOrds.push(scene.scene.ord);
      await submitConversationAttempt(d1(sqlite), 1, {
        clientAttemptId: `scene-round-${round}`, chunkId: chunk.id, sceneId: scene.scene.id, role: "say", grade: "good", answeredAt: 1_800_000_000_000 + round, loop: "roleplay", input: "tap",
      }, new Date(1_800_000_100_000));
    }
    expect(sceneOrds).toEqual([1, 2, 3, 1]);
  });

  it("accepts a scene attempt for a chunk that the scene's unit lists", async () => {
    const sqlite = seededDatabase();
    const chunk = sqlite.prepare("SELECT id, role FROM conv_chunks WHERE key = 'ask-repeat-polite'").get() as { id: number; role: "say" | "hear" };
    const scene = sqlite.prepare("SELECT id FROM conv_scenes").get() as { id: number };
    const now = new Date(1_800_000_000_000);
    await expect(submitConversationAttempt(d1(sqlite), 1, {
      clientAttemptId: "scene-attempt-1", chunkId: chunk.id, sceneId: scene.id, role: chunk.role, grade: "good", answeredAt: now.getTime(), loop: "roleplay", input: "tap",
    }, now)).resolves.toEqual({ grade: "good" });
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM conv_attempts WHERE scene_id = ?").get(scene.id)).toEqual({ n: 1 });
  });

  it("reports the owning unit for due chunks", async () => {
    const sqlite = seededDatabase();
    const chunk = sqlite.prepare("SELECT id FROM conv_chunks WHERE key = 'ask-repeat-polite'").get() as { id: number };
    const now = new Date(1_800_000_000_000);
    await submitConversationAttempt(d1(sqlite), 1, { clientAttemptId: "drill-attempt-1", chunkId: chunk.id, role: "say", grade: "good", answeredAt: now.getTime(), loop: "drill", input: "voice" }, now);
    const due = await getDueConversationChunks(d1(sqlite), 1, now.getTime() + 365 * 86_400_000);
    expect(due.chunks.some((item) => item.id === chunk.id && item.unitId > 0)).toBe(true);
  });
});
