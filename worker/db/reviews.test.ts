import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { initialState, schedule } from "../../src/shared/fsrs";
import { appendLog, getDueQueue, getState, getStatsForCharacter, upsertState } from "./reviews";

function d1Result<T>(results: T[]): D1Result<T> {
  return {
    results,
    success: true,
    meta: {
      duration: 0,
      size_after: 0,
      rows_read: 0,
      rows_written: 0,
      last_row_id: 0,
      changed_db: false,
      changes: 0,
    },
  };
}

function d1(sqlite: DatabaseSync): D1Database {
  const adapter = Object.create(null) as D1Database;
  adapter.prepare = (query: string) => {
    let values: SQLInputValue[] = [];
    const prepared = Object.create(null) as D1PreparedStatement;
    prepared.bind = (...bound: unknown[]) => {
      values = bound.map((value) => {
        if (typeof value === "string" || typeof value === "number" || typeof value === "bigint" || value === null) return value;
        throw new Error(`Unsupported test binding: ${String(value)}`);
      });
      return prepared;
    };
    prepared.first = async <T>() =>
      (sqlite.prepare(query).get(...values) as T | undefined) ?? null;
    prepared.all = async <T>() =>
      d1Result(sqlite.prepare(query).all(...values) as T[]);
    prepared.run = async <T>() => {
      sqlite.prepare(query).run(...values);
      return d1Result<T>([]);
    };
    return prepared;
  };
  adapter.batch = async <T>(statements: D1PreparedStatement[]) => Promise.all(statements.map((statement) => statement.all<T>()));
  return adapter;
}

function addCharacter(sqlite: DatabaseSync, key: string, tracks: Array<"kr" | "jp" | "cn">): number {
  const result = sqlite.prepare(`
    INSERT INTO characters (key, meaning_en, meaning_ko, variants)
    VALUES (?, 'meaning', '뜻', '{}')
  `).run(key);
  const id = Number(result.lastInsertRowid);
  for (const track of tracks) {
    sqlite.prepare(`
      INSERT INTO character_tracks (
        character_id, track, glyph, level_ord, kr_reading, kr_level,
        jp_on, jp_kun, jp_kanken, jp_jlpt, cn_pinyin, cn_meaning, cn_hsk, cn_tier
      ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      track,
      key,
      track === "kr" ? "뜻 음" : null,
      track === "kr" ? "8급" : null,
      track === "jp" ? "オン" : null,
      track === "jp" ? "よみ" : null,
      track === "jp" ? "10級" : null,
      track === "jp" ? "N5" : null,
      track === "cn" ? "yī" : null,
      track === "cn" ? "one" : null,
      track === "cn" ? "1" : null,
      track === "cn" ? "1" : null,
    );
  }
  return id;
}

describe("review persistence", () => {
  const databases: DatabaseSync[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) database.close();
  });

  it("filters due states by enabled tracks, due time, and limit", async () => {
    const sqlite = new DatabaseSync(":memory:");
    databases.push(sqlite);
    sqlite.exec(readFileSync("migrations/0001_init.sql", "utf8"));
    sqlite.exec(readFileSync("migrations/0002_fsrs.sql", "utf8"));
    sqlite.exec(readFileSync("migrations/0003_sessions.sql", "utf8"));
    sqlite.exec(readFileSync("migrations/0004_profile.sql", "utf8"));
    sqlite.exec(readFileSync("migrations/0005_onyomi_script.sql", "utf8"));
    sqlite.exec(readFileSync("migrations/0006_skipped.sql", "utf8"));
    const database = d1(sqlite);
    const now = new Date("2026-01-10T00:00:00.000Z");
    const firstId = addCharacter(sqlite, "一", ["kr", "jp"]);
    const secondId = addCharacter(sqlite, "二", ["kr"]);

    await upsertState(database, firstId, "kr", { ...initialState(now), due: new Date("2026-01-08T00:00:00.000Z") });
    await upsertState(database, firstId, "jp", { ...initialState(now), due: new Date("2026-01-07T00:00:00.000Z") });
    await upsertState(database, secondId, "kr", { ...initialState(now), due: new Date("2026-01-09T00:00:00.000Z") });

    const queue = await getDueQueue(database, ["kr"], 1, now);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ characterId: firstId, track: "kr" });
    expect((await getState(database, firstId, "jp"))?.due.toISOString()).toBe("2026-01-07T00:00:00.000Z");

    const result = schedule(initialState(now), "good", now);
    await upsertState(database, firstId, "kr", result.next);
    await appendLog(database, {
      ...result.log,
      characterId: firstId,
      track: "kr",
      correct: true,
      skipped: false,
      elapsedMs: 5_000,
      mode: "lesson",
    });
    expect(await getStatsForCharacter(database, firstId)).toMatchObject({
      correct: 1,
      total: 1,
      accuracy: 1,
      intervals: [result.next.scheduledDays],
    });
  });
});
