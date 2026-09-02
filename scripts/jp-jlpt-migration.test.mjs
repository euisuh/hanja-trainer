import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const migrations = readdirSync("migrations")
  .filter((name) => name.endsWith(".sql") && name < "0014_jp_jlpt_curriculum.sql")
  .sort();

function rows(db, sql) {
  return db.prepare(sql).all().map((row) => ({ ...row }));
}

test("JLPT migration resets only obsolete Japanese curriculum state", () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const migration of migrations) db.exec(readFileSync(`migrations/${migration}`, "utf8"));
    db.exec(`
      INSERT INTO characters (key, meaning_en, meaning_ko, variants, stroke_count) VALUES
        ('日', 'day', '날', '{"jp":"日","cn":"日"}', 4),
        ('分', 'part', '나눌', '{"jp":"分"}', 4),
        ('里', 'village', '마을', '{"jp":"里"}', 7),
        ('身', 'body', '몸', '{"jp":"身"}', 7),
        ('畑', 'field', '밭', '{"jp":"畑"}', 9),
        ('中', 'middle', '가운데', '{"cn":"中"}', 4);

      INSERT INTO character_tracks (character_id, track, glyph, jp_on, jp_kun, jp_kanken, jp_jlpt, level_ord)
        SELECT id, 'jp', key, 'オン', 'くん', '10級', 'N5', 1 FROM characters WHERE key = '日';
      INSERT INTO character_tracks (character_id, track, glyph, jp_on, jp_kun, jp_kanken, jp_jlpt, level_ord)
        SELECT id, 'jp', key, 'オン', 'くん', '未指定', 'N1', 9 FROM characters WHERE key IN ('分', '里', '身', '畑');
      INSERT INTO character_tracks (character_id, track, glyph, cn_pinyin, cn_meaning, cn_hsk, cn_tier, level_ord)
        SELECT id, 'cn', key, 'rì', 'day', 'HSK 1', '一级字', 1 FROM characters WHERE key = '日';
      INSERT INTO character_tracks (character_id, track, glyph, cn_pinyin, cn_meaning, cn_hsk, cn_tier, level_ord)
        SELECT id, 'cn', key, 'zhōng', 'middle', 'HSK 1', '一级字', 1 FROM characters WHERE key = '中';

      INSERT INTO example_sentences (character_id, track, text, translation_ko, source, source_kind, target_index, rank)
        SELECT id, 'jp', '分ける。', '나누다.', 'legacy', 'textbook', 0, 0 FROM characters WHERE key = '分';
      INSERT INTO example_sentences (character_id, track, text, translation_ko, source, source_kind, target_index, rank)
        SELECT id, 'cn', '日。', '날.', 'cn-source', 'textbook', 0, 0 FROM characters WHERE key = '日';

      INSERT INTO review_states (character_id, track, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, due)
        SELECT id, 'jp', 2, 5, 1, 2, 2, 0, 2, 10 FROM characters WHERE key IN ('日', '分');
      INSERT INTO review_states (character_id, track, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, due)
        SELECT id, 'cn', 2, 5, 1, 2, 2, 0, 2, 10 FROM characters WHERE key = '日';
      INSERT INTO review_log (character_id, track, rating, answered_at, correct, elapsed_ms, scheduled_days_before, scheduled_days_after, mode)
        SELECT id, 'jp', 3, 1, 1, 500, 1, 2, 'review' FROM characters WHERE key = '日';
      INSERT INTO review_log (character_id, track, rating, answered_at, correct, elapsed_ms, scheduled_days_before, scheduled_days_after, mode)
        SELECT id, 'cn', 3, 1, 1, 500, 1, 2, 'review' FROM characters WHERE key = '日';

      INSERT INTO curriculum_units (track, level, ord, title, subtitle) VALUES
        ('jp', '10級', 1, '旧日本語', 'legacy'),
        ('cn', 'HSK 1', 1, '中国語', 'retained');
      INSERT INTO curriculum_unit_members (unit_id, character_id, ord)
        SELECT curriculum_units.id, characters.id, 1 FROM curriculum_units JOIN characters
        WHERE curriculum_units.track = 'jp' AND characters.key = '日';
      INSERT INTO curriculum_unit_members (unit_id, character_id, ord)
        SELECT curriculum_units.id, characters.id, 1 FROM curriculum_units JOIN characters
        WHERE curriculum_units.track = 'cn' AND characters.key = '中';
      INSERT INTO curriculum_unit_completion_members (unit_id, character_id, completed_at)
        SELECT curriculum_units.id, characters.id, 1 FROM curriculum_units JOIN characters
        WHERE curriculum_units.track = 'jp' AND characters.key = '日';
      INSERT INTO curriculum_unit_completion_members (unit_id, character_id, completed_at)
        SELECT curriculum_units.id, characters.id, 1 FROM curriculum_units JOIN characters
        WHERE curriculum_units.track = 'cn' AND characters.key = '中';
      INSERT INTO curriculum_unit_test_attempts (session_id, unit_id, expected_answers, created_at, expires_at)
        SELECT 'jp-test', id, '[]', 1, 2 FROM curriculum_units WHERE track = 'jp';
      INSERT INTO curriculum_unit_test_attempts (session_id, unit_id, expected_answers, created_at, expires_at)
        SELECT 'cn-test', id, '[]', 1, 2 FROM curriculum_units WHERE track = 'cn';

      INSERT INTO placement_results (track, level_ord, level_badge, accuracy, detail, taken_at) VALUES
        ('jp', 2, '9級', 60, 'legacy', 1),
        ('cn', 1, 'HSK 1', 80, 'retained', 1);
    `);

    const retainedJapaneseHistory = {
      states: rows(db, "SELECT * FROM review_states WHERE track = 'jp' AND character_id = (SELECT id FROM characters WHERE key = '日')"),
      log: rows(db, "SELECT * FROM review_log WHERE track = 'jp'"),
    };
    const japaneseUnitId = db.prepare("SELECT id FROM curriculum_units WHERE track = 'jp'").get().id;
    const chineseState = {
      tracks: rows(db, "SELECT * FROM character_tracks WHERE track = 'cn' ORDER BY character_id"),
      sentences: rows(db, "SELECT * FROM example_sentences WHERE track = 'cn'"),
      reviews: rows(db, "SELECT * FROM review_states WHERE track = 'cn'"),
      log: rows(db, "SELECT * FROM review_log WHERE track = 'cn'"),
      units: rows(db, "SELECT * FROM curriculum_units WHERE track = 'cn'"),
      members: rows(db, "SELECT cum.* FROM curriculum_unit_members cum JOIN curriculum_units cu ON cu.id = cum.unit_id WHERE cu.track = 'cn'"),
      completions: rows(db, "SELECT cucm.* FROM curriculum_unit_completion_members cucm JOIN curriculum_units cu ON cu.id = cucm.unit_id WHERE cu.track = 'cn'"),
      attempts: rows(db, "SELECT cuta.* FROM curriculum_unit_test_attempts cuta JOIN curriculum_units cu ON cu.id = cuta.unit_id WHERE cu.track = 'cn'"),
      placement: rows(db, "SELECT * FROM placement_results WHERE track = 'cn'"),
    };

    db.exec(readFileSync("migrations/0014_jp_jlpt_curriculum.sql", "utf8"));

    assert.deepEqual(rows(db, "SELECT c.key FROM character_tracks ct JOIN characters c ON c.id = ct.character_id WHERE ct.track = 'jp' ORDER BY c.key"), [{ key: "日" }]);
    assert.deepEqual(rows(db, "SELECT c.key FROM example_sentences es JOIN characters c ON c.id = es.character_id WHERE es.track = 'jp'"), []);
    assert.deepEqual(rows(db, "SELECT c.key FROM review_states rs JOIN characters c ON c.id = rs.character_id WHERE rs.track = 'jp' ORDER BY c.key"), [{ key: "日" }]);
    assert.deepEqual({
      states: rows(db, "SELECT * FROM review_states WHERE track = 'jp' AND character_id = (SELECT id FROM characters WHERE key = '日')"),
      log: rows(db, "SELECT * FROM review_log WHERE track = 'jp'"),
    }, retainedJapaneseHistory);
    assert.deepEqual(rows(db, "SELECT * FROM curriculum_units WHERE track = 'jp'"), []);
    assert.deepEqual(db.prepare("SELECT * FROM curriculum_unit_members WHERE unit_id = ?").all(japaneseUnitId), []);
    assert.deepEqual(db.prepare("SELECT * FROM curriculum_unit_completion_members WHERE unit_id = ?").all(japaneseUnitId), []);
    assert.deepEqual(rows(db, "SELECT * FROM curriculum_unit_test_attempts WHERE session_id = 'jp-test'"), []);
    assert.deepEqual(rows(db, "SELECT * FROM placement_results WHERE track = 'jp'"), []);

    assert.deepEqual({
      tracks: rows(db, "SELECT * FROM character_tracks WHERE track = 'cn' ORDER BY character_id"),
      sentences: rows(db, "SELECT * FROM example_sentences WHERE track = 'cn'"),
      reviews: rows(db, "SELECT * FROM review_states WHERE track = 'cn'"),
      log: rows(db, "SELECT * FROM review_log WHERE track = 'cn'"),
      units: rows(db, "SELECT * FROM curriculum_units WHERE track = 'cn'"),
      members: rows(db, "SELECT cum.* FROM curriculum_unit_members cum JOIN curriculum_units cu ON cu.id = cum.unit_id WHERE cu.track = 'cn'"),
      completions: rows(db, "SELECT cucm.* FROM curriculum_unit_completion_members cucm JOIN curriculum_units cu ON cu.id = cucm.unit_id WHERE cu.track = 'cn'"),
      attempts: rows(db, "SELECT cuta.* FROM curriculum_unit_test_attempts cuta JOIN curriculum_units cu ON cu.id = cuta.unit_id WHERE cu.track = 'cn'"),
      placement: rows(db, "SELECT * FROM placement_results WHERE track = 'cn'"),
    }, chineseState);
  } finally {
    db.close();
  }
});
