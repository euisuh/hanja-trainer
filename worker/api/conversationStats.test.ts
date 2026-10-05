/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/require-safety-comment-for-type-assertion -- SQLite D1 adapter mirrors neighboring Worker API fixture tests. */
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../test/schema";
import { getConversationStats } from "./conversationStats";

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
    return statement;
  };
  database.batch = async <T>(statements: D1PreparedStatement[]) => Promise.all(statements.map((statement) => statement.all<T>()));
  return database;
}

function seed(sqlite: DatabaseSync) {
  sqlite.prepare("UPDATE profile SET timezone = 'UTC' WHERE id = 1").run();
  const unitId = Number(sqlite.prepare("INSERT INTO conv_units (ord, title_ko, goal_ko) VALUES (1, 'x', 'x')").run().lastInsertRowid);
  const chunk = sqlite.prepare("INSERT INTO conv_chunks (unit_id, ord, ja, kana, ko_cue, register, role, source_kind, source_ref, audio_key) VALUES (?, ?, ?, ?, 'x', 'polite', 'say', 'fixture', 'fixture', 'fixture')");
  const firstChunk = Number(chunk.run(unitId, 1, "a", "a").lastInsertRowid);
  const secondChunk = Number(chunk.run(unitId, 2, "b", "b").lastInsertRowid);
  const scene = sqlite.prepare("INSERT INTO conv_scenes (unit_id, ord, title_ko, setting_ko, goal_ko) VALUES (?, ?, 'x', 'x', 'x')");
  const firstScene = Number(scene.run(unitId, 1).lastInsertRowid);
  const secondScene = Number(scene.run(unitId, 2).lastInsertRowid);
  sqlite.prepare("INSERT INTO conv_chunk_states (profile_id, chunk_id, role, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, due) VALUES (1, ?, 'say', ?, 5, 0, 1, 1, 0, ?, 0)").run(firstChunk, 21, 2);
  sqlite.prepare("INSERT INTO conv_chunk_states (profile_id, chunk_id, role, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, due) VALUES (1, ?, 'say', ?, 5, 0, 1, 1, 0, ?, 0)").run(secondChunk, 50, 1);
  const attempt = sqlite.prepare("INSERT INTO conv_attempts (profile_id, client_attempt_id, chunk_id, scene_id, role, grade, answered_at, latency_ms, hints, replays, loop, input) VALUES (1, ?, ?, ?, 'say', ?, ?, ?, ?, ?, ?, 'voice')");
  const day = Date.UTC(2026, 9, 4);
  attempt.run("one", firstChunk, firstScene, 2, day, 1000, 0, 0, "drill");
  attempt.run("retry", firstChunk, firstScene, 4, day + 1, 2000, 0, 0, "drill");
  attempt.run("transfer-ok", firstChunk, secondScene, 3, day + 86_400_000, 3000, 0, 0, "roleplay");
  attempt.run("two", secondChunk, firstScene, 3, day, 4000, 0, 0, "drill");
  attempt.run("transfer-fail", secondChunk, secondScene, 2, day + 86_400_000, 9000, 0, 0, "roleplay");
}

describe("conversation stats", () => {
  const databases: DatabaseSync[] = [];
  afterEach(() => { for (const database of databases.splice(0)) database.close(); });

  it("calculates retention, first tries, onset median, transfer, and speaking diary", async () => {
    const sqlite = new DatabaseSync(":memory:");
    databases.push(sqlite);
    applyMigrations(sqlite);
    seed(sqlite);
    const stats = await getConversationStats(d1(sqlite), 1, new Date("2026-10-05T12:00:00Z"));
    expect(stats.spokenChunkRetention).toBe(1);
    expect(stats.unaidedFirstTryRate).toBe(0.5);
    expect(stats.medianOnsetLatencyMs).toBe(2500);
    expect(stats.transferRate).toBe(0.5);
    expect(stats.calendar.filter((day) => day.count > 0).map((day) => day.date)).toEqual(["2026-10-04", "2026-10-05"]);
    expect(stats.spokenDaysThisWeek).toBe(2);
  });

  it("returns null where no metric denominator exists", async () => {
    const sqlite = new DatabaseSync(":memory:");
    databases.push(sqlite);
    applyMigrations(sqlite);
    const stats = await getConversationStats(d1(sqlite), 1, new Date("2026-10-05T12:00:00Z"));
    expect(stats.spokenChunkRetention).toBeNull();
    expect(stats.unaidedFirstTryRate).toBeNull();
    expect(stats.medianOnsetLatencyMs).toBeNull();
    expect(stats.transferRate).toBeNull();
  });
});
