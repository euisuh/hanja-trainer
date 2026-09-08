import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

const MIGRATION = "0024_idempotent_session_summaries.sql";

function applyBeforeSummary(sqlite: DatabaseSync) {
  for (const name of readdirSync("migrations").filter((name) => name.endsWith(".sql") && name < MIGRATION).sort()) {
    sqlite.exec(readFileSync(`migrations/${name}`, "utf8"));
  }
}

describe("session summary migration", () => {
  const databases: DatabaseSync[] = [];
  afterEach(() => { for (const database of databases.splice(0)) database.close(); });

  it("preserves legacy sessions, XP, and foreign keys while isolating keyed credit", () => {
    const sqlite = new DatabaseSync(":memory:");
    databases.push(sqlite);
    applyBeforeSummary(sqlite);
    sqlite.prepare("UPDATE profile SET xp = 40, updated_at = 100 WHERE id = 1").run();
    sqlite.prepare(`
      INSERT INTO sessions (profile_id, mode, started_at, ended_at, answered, correct, skipped, best_combo, xp)
      VALUES (1, 'lesson', 10, 20, 2, 1, 1, 1, 10)
    `).run();
    const foreignKeys = sqlite.prepare("PRAGMA foreign_key_list(sessions)").all();

    sqlite.exec(readFileSync(`migrations/${MIGRATION}`, "utf8"));

    expect(sqlite.prepare("SELECT mode, xp, client_session_id FROM sessions").all()).toEqual([
      { mode: "lesson", xp: 10, client_session_id: null },
    ]);
    expect(sqlite.prepare("SELECT xp, updated_at FROM profile WHERE id = 1").get()).toEqual({ xp: 40, updated_at: 100 });
    expect(sqlite.prepare("PRAGMA foreign_key_list(sessions)").all()).toEqual(foreignKeys);
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);

    sqlite.prepare(`
      INSERT INTO sessions (profile_id, mode, started_at, ended_at, answered, correct, skipped, best_combo, xp)
      VALUES (1, 'review', 30, 40, 1, 1, 0, 1, 7)
    `).run();
    expect(sqlite.prepare("SELECT xp FROM profile WHERE id = 1").get()).toEqual({ xp: 40 });
    sqlite.prepare("UPDATE profile SET xp = xp + 7 WHERE id = 1").run();

    const keyedInsert = sqlite.prepare(`
      INSERT INTO sessions (profile_id, client_session_id, mode, started_at, ended_at, answered, correct, skipped, best_combo, xp)
      VALUES (1, 'stable-id', 'lesson', 50, 60, 1, 1, 0, 1, 5)
      ON CONFLICT(profile_id, client_session_id) DO NOTHING
    `);
    keyedInsert.run();
    keyedInsert.run();
    expect(sqlite.prepare("SELECT xp, updated_at FROM profile WHERE id = 1").get()).toEqual({ xp: 52, updated_at: 100 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM sessions WHERE client_session_id = 'stable-id'").get()).toEqual({ count: 1 });
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});
