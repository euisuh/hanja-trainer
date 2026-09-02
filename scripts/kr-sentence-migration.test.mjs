import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("Korean sentence curation migration preserves other tracks", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("migrations/0001_init.sql", "utf8"));
    db.exec(readFileSync("migrations/0013_sentence_readings.sql", "utf8"));
    db.exec(`
      INSERT INTO characters (key, meaning_en, meaning_ko, variants, stroke_count)
      VALUES ('日', 'day', '날', '{"kr":"日","jp":"日"}', 4);
      INSERT INTO character_tracks (character_id, track, glyph, kr_reading, kr_level, level_ord)
        SELECT id, 'kr', '日', '날 일', '8급', 1 FROM characters WHERE key = '日';
      INSERT INTO character_tracks (character_id, track, glyph, jp_on, jp_kun, jp_kanken, jp_jlpt, level_ord)
        SELECT id, 'jp', '日', 'ニチ', 'ひ', '10級', 'N5', 1 FROM characters WHERE key = '日';
      INSERT INTO example_sentences (character_id, track, text, reading, translation_ko, source, source_kind, target_index, rank)
        SELECT id, 'kr', '終日이다', NULL, '종일이다', 'legacy', 'corpus', 0, 0 FROM characters WHERE key = '日';
      INSERT INTO example_sentences (character_id, track, text, reading, translation_ko, source, source_kind, target_index, rank)
        SELECT id, 'jp', '日です', 'ひです', '날입니다', 'retained', 'corpus', 0, 0 FROM characters WHERE key = '日';
    `);

    db.exec(readFileSync("migrations/0016_kr_sentence_curation.sql", "utf8"));
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM example_sentences WHERE track = 'kr'").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM example_sentences WHERE track = 'jp'").get().count, 1);
  } finally {
    db.close();
  }
});
