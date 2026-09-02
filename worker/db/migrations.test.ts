import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

const MIGRATION = "0017_multi_profile.sql";
const PROGRESS_TABLES = [
  "review_states",
  "review_log",
  "review_submissions",
  "sessions",
  "placement_results",
  "curriculum_unit_completion_members",
  "curriculum_unit_test_attempts",
] as const;

function applyBeforeMultiProfile(sqlite: DatabaseSync): void {
  for (const name of readdirSync("migrations").filter((name) => name.endsWith(".sql") && name < MIGRATION).sort()) {
    sqlite.exec(readFileSync(`migrations/${name}`, "utf8"));
  }
}

function seedContent(sqlite: DatabaseSync): { characterId: number; unitId: number } {
  const characterId = Number(sqlite.prepare(`
    INSERT INTO characters (key, meaning_en, meaning_ko, variants)
    VALUES ('學', 'learn', '배우다', '[]')
  `).run().lastInsertRowid);
  sqlite.prepare(`
    INSERT INTO character_tracks (character_id, track, glyph, kr_reading, kr_level, level_ord)
    VALUES (?, 'kr', '學', '학', '8급', 1)
  `).run(characterId);
  const unitId = Number(sqlite.prepare(`
    INSERT INTO curriculum_units (track, level, ord, title, subtitle)
    VALUES ('kr', '8급', 1, '첫 단원', '학습')
  `).run().lastInsertRowid);
  sqlite.prepare(`
    INSERT INTO curriculum_unit_members (unit_id, character_id, ord)
    VALUES (?, ?, 1)
  `).run(unitId, characterId);
  return { characterId, unitId };
}

function seedLegacyProgress(sqlite: DatabaseSync, characterId: number, unitId: number): void {
  sqlite.prepare(`
    INSERT INTO review_states (
      character_id, track, stability, difficulty, elapsed_days, scheduled_days,
      learning_steps, reps, lapses, state, last_review, due, correct_count, total_count
    ) VALUES (?, 'kr', 2, 5, 1, 2, 0, 2, 0, 2, 100, 200, 1, 2)
  `).run(characterId);
  sqlite.prepare(`
    INSERT INTO review_log (
      character_id, track, rating, answered_at, correct, elapsed_ms,
      scheduled_days_before, scheduled_days_after, mode, session_id, card_index, skipped
    ) VALUES (?, 'kr', 3, 200, 1, 900, 1, 2, 'lesson', 'legacy', 0, 0)
  `).run(characterId);
  sqlite.prepare(`
    INSERT INTO review_submissions (session_id, card_index, response_json)
    VALUES ('legacy', 0, '{}')
  `).run();
  sqlite.prepare(`
    INSERT INTO sessions (mode, started_at, ended_at, answered, correct, skipped, best_combo, xp)
    VALUES ('lesson', 100, 200, 2, 1, 1, 1, 10)
  `).run();
  sqlite.prepare(`
    INSERT INTO placement_results (track, level_ord, level_badge, accuracy, detail, taken_at)
    VALUES ('kr', 1, '8급', 75, '{}', 200)
  `).run();
  sqlite.prepare(`
    INSERT INTO curriculum_unit_completion_members (unit_id, character_id, completed_at)
    VALUES (?, ?, 200)
  `).run(unitId, characterId);
  sqlite.prepare(`
    INSERT INTO curriculum_unit_test_attempts (
      session_id, unit_id, expected_answers, created_at, expires_at
    ) VALUES ('legacy', ?, '[]', 100, 300)
  `).run(unitId);
}

function seedProfileProgress(sqlite: DatabaseSync, profileId: number, characterId: number, unitId: number): void {
  sqlite.prepare(`
    INSERT INTO review_states (
      profile_id, character_id, track, stability, difficulty, elapsed_days,
      scheduled_days, reps, lapses, state, due
    ) VALUES (?, ?, 'kr', 2, 5, 1, 2, 2, 0, 2, 200)
  `).run(profileId, characterId);
  sqlite.prepare(`
    INSERT INTO review_log (
      profile_id, character_id, track, rating, answered_at, correct, elapsed_ms,
      scheduled_days_before, scheduled_days_after, mode, session_id, card_index
    ) VALUES (?, ?, 'kr', 3, 200, 1, 900, 1, 2, 'lesson', 'shared', 0)
  `).run(profileId, characterId);
  sqlite.prepare(`
    INSERT INTO review_submissions (profile_id, session_id, card_index, response_json)
    VALUES (?, 'shared', 0, '{}')
  `).run(profileId);
  sqlite.prepare(`
    INSERT INTO sessions (profile_id, mode, started_at, ended_at, answered, correct, best_combo, xp)
    VALUES (?, 'lesson', 100, 200, 1, 1, 1, 10)
  `).run(profileId);
  sqlite.prepare(`
    INSERT INTO placement_results (profile_id, track, level_ord, level_badge, accuracy, detail, taken_at)
    VALUES (?, 'kr', 1, '8급', 75, '{}', 200)
  `).run(profileId);
  sqlite.prepare(`
    INSERT INTO curriculum_unit_completion_members (profile_id, unit_id, character_id, completed_at)
    VALUES (?, ?, ?, 200)
  `).run(profileId, unitId, characterId);
  sqlite.prepare(`
    INSERT INTO curriculum_unit_test_attempts (
      profile_id, session_id, unit_id, expected_answers, created_at, expires_at
    ) VALUES (?, 'shared', ?, '[]', 100, 300)
  `).run(profileId, unitId);
}

describe("multi-profile migration", () => {
  const databases: DatabaseSync[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) database.close();
  });

  it("backfills legacy data and enforces profile ownership", () => {
    const sqlite = new DatabaseSync(":memory:");
    databases.push(sqlite);
    applyBeforeMultiProfile(sqlite);
    const { characterId, unitId } = seedContent(sqlite);
    seedLegacyProgress(sqlite, characterId, unitId);
    sqlite.prepare(`
      UPDATE profile SET
        enabled_tracks = '["kr"]', daily_goal = 60, timezone = 'Asia/Tokyo',
        xp = 42, onboarded_at = 123, onyomi_script = 'hiragana', theme = 'default',
        pin_hash = 'hash', pin_salt = 'salt', pin_iterations = 99,
        pin_secret = 'secret', pin_failures = 2, pin_locked_until = 456,
        created_at = 10, updated_at = 20
      WHERE id = 1
    `).run();

    sqlite.exec(readFileSync(`migrations/${MIGRATION}`, "utf8"));

    expect(sqlite.prepare("SELECT * FROM profile WHERE id = 1").get()).toMatchObject({
      id: 1,
      name: "나",
      is_admin: 1,
      enabled_tracks: '["kr"]',
      daily_goal: 60,
      timezone: "Asia/Tokyo",
      xp: 42,
      onboarded_at: 123,
      onyomi_script: "hiragana",
      theme: "default",
      pin_hash: "hash",
      pin_salt: "salt",
      pin_iterations: 99,
      pin_secret: "secret",
      pin_failures: 2,
      pin_locked_until: 456,
      created_at: 10,
      updated_at: 20,
    });
    for (const table of PROGRESS_TABLES) {
      expect(sqlite.prepare(`SELECT profile_id FROM ${table}`).all()).toEqual([{ profile_id: 1 }]);
      expect(sqlite.prepare(`PRAGMA foreign_key_list(${table})`).all()).toContainEqual(expect.objectContaining({
        table: "profile",
        from: "profile_id",
        to: "id",
        on_delete: "CASCADE",
      }));
    }
    expect(sqlite.prepare("PRAGMA table_info(review_states)").all()
      .filter((column) => Number(column.pk) > 0)
      .map((column) => column.name)).toEqual(["profile_id", "character_id", "track"]);
    expect(sqlite.prepare("PRAGMA table_info(curriculum_unit_completion_members)").all()
      .filter((column) => Number(column.pk) > 0)
      .map((column) => column.name)).toEqual(["profile_id", "unit_id", "character_id"]);
    expect(sqlite.prepare("PRAGMA table_info(curriculum_unit_test_attempts)").all()
      .filter((column) => Number(column.pk) > 0)
      .map((column) => column.name)).toEqual(["profile_id", "session_id", "unit_id"]);
    expect(sqlite.prepare("PRAGMA table_info(review_submissions)").all()
      .filter((column) => Number(column.pk) > 0)
      .map((column) => column.name)).toEqual(["profile_id", "session_id", "card_index"]);
    expect(sqlite.prepare("PRAGMA index_info(idx_review_log_submission)").all()
      .map((column) => column.name)).toEqual(["profile_id", "session_id", "card_index", "character_id"]);
    expect(sqlite.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND tbl_name IN (
        'review_states', 'review_log', 'sessions', 'placement_results',
        'curriculum_unit_test_attempts'
      ) AND name LIKE 'idx_%'
      ORDER BY name
    `).all().map((index) => index.name)).toEqual([
      "idx_curriculum_unit_test_attempts_expiry",
      "idx_placement_results_track_taken",
      "idx_review_log_answered_at",
      "idx_review_log_character_track",
      "idx_review_log_submission",
      "idx_review_states_due",
      "idx_review_states_track_due",
      "idx_sessions_ended_at",
    ]);
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(sqlite.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });

    expect(() => sqlite.prepare("INSERT INTO profile (name, is_admin) VALUES ('Other admin', 1)").run()).toThrow("UNIQUE constraint failed");
    for (const name of ["Two", "Three", "Four", "Five"]) {
      sqlite.prepare("INSERT INTO profile (name) VALUES (?)").run(name);
    }
    expect(() => sqlite.prepare("INSERT INTO profile (name) VALUES ('Six')").run()).toThrow("profile limit reached");
    expect(() => sqlite.prepare("UPDATE profile SET is_admin = 1 WHERE id = 2").run()).toThrow("is_admin is immutable");
    expect(() => sqlite.prepare("DELETE FROM profile WHERE id = 1").run()).toThrow("the admin profile cannot be deleted");

    seedProfileProgress(sqlite, 2, characterId, unitId);
    seedProfileProgress(sqlite, 3, characterId, unitId);
    sqlite.prepare("DELETE FROM profile WHERE id = 2").run();
    for (const table of PROGRESS_TABLES) {
      expect(sqlite.prepare(`SELECT profile_id FROM ${table} WHERE profile_id IN (2, 3)`).all()).toEqual([{ profile_id: 3 }]);
    }
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});
