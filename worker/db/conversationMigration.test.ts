import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

const MIGRATION = "0025_conversation_core.sql";

function applyBeforeConversation(sqlite: DatabaseSync): void {
  for (const name of readdirSync("migrations").filter((name) => name.endsWith(".sql") && name < MIGRATION).sort()) {
    sqlite.exec(readFileSync(`migrations/${name}`, "utf8"));
  }
}

function applyAll(sqlite: DatabaseSync): void {
  for (const name of readdirSync("migrations").filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`migrations/${name}`, "utf8"));
  }
}

describe("conversation core migration", () => {
  const databases: DatabaseSync[] = [];
  afterEach(() => { for (const database of databases.splice(0)) database.close(); });

  it("applies to a fresh database", () => {
    const sqlite = new DatabaseSync(":memory:");
    databases.push(sqlite);
    applyAll(sqlite);

    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'conv_%' ORDER BY name").all())
      .toEqual([
        { name: "conv_attempts" },
        { name: "conv_chunk_states" },
        { name: "conv_chunks" },
        { name: "conv_scene_turns" },
        { name: "conv_scenes" },
        { name: "conv_units" },
      ]);
    expect(sqlite.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
  });

  it("upgrades existing profiles and cascades their conversation rows", () => {
    const sqlite = new DatabaseSync(":memory:");
    databases.push(sqlite);
    applyBeforeConversation(sqlite);
    sqlite.prepare("INSERT INTO profile (name) VALUES ('학습자')").run();
    sqlite.exec(readFileSync(`migrations/${MIGRATION}`, "utf8"));
    const unitId = Number(sqlite.prepare("INSERT INTO conv_units (ord, title_ko, goal_ko) VALUES (1, '수리', '다시 묻기')").run().lastInsertRowid);
    const chunkId = Number(sqlite.prepare(`
      INSERT INTO conv_chunks (unit_id, ord, ja, kana, ko_cue, register, role, source_kind, source_ref, audio_key)
      VALUES (?, 1, 'もう一度お願いします', 'もういちどおねがいします', '다시 말해 달라고 하기', 'polite', 'say', 'corpus', 'Tatoeba #1', 'jp/c/test.mp3')
    `).run(unitId).lastInsertRowid);
    const sceneId = Number(sqlite.prepare("INSERT INTO conv_scenes (unit_id, ord, title_ko, setting_ko, goal_ko) VALUES (?, 1, '확인', '가게', '다시 묻기')").run(unitId).lastInsertRowid);
    sqlite.prepare("INSERT INTO conv_scene_turns (scene_id, ord, speaker, chunk_ids) VALUES (?, 1, 'learner', '[1]')").run(sceneId);
    sqlite.prepare(`
      INSERT INTO conv_chunk_states (
        profile_id, chunk_id, role, stability, difficulty, elapsed_days, scheduled_days,
        reps, lapses, state, due
      ) VALUES (2, ?, 'say', 1, 5, 0, 1, 1, 0, 1, 100)
    `).run(chunkId);
    sqlite.prepare(`
      INSERT INTO conv_attempts (profile_id, client_attempt_id, chunk_id, scene_id, role, grade, answered_at)
      VALUES (2, 'attempt-1', ?, ?, 'say', 3, 100)
    `).run(chunkId, sceneId);

    sqlite.prepare("DELETE FROM profile WHERE id = 2").run();
    for (const table of ["conv_chunk_states", "conv_attempts"]) {
      expect(sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE profile_id = 2`).get(), table).toEqual({ count: 0 });
    }
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM conv_chunks").get()).toEqual({ count: 1 });
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});
