PRAGMA foreign_keys = ON;

CREATE TABLE words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track TEXT NOT NULL CHECK (track IN ('kr', 'jp', 'cn')),
  glyph TEXT NOT NULL,
  reading TEXT NOT NULL,
  level TEXT NOT NULL,
  level_ord INTEGER NOT NULL CHECK (level_ord > 0),
  source_url TEXT NOT NULL,
  UNIQUE (track, glyph, reading)
);

CREATE TABLE word_members (
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (word_id, position)
);

CREATE INDEX idx_word_members_character ON word_members(character_id, word_id);

DROP INDEX idx_review_log_submission;
CREATE UNIQUE INDEX idx_review_log_submission
  ON review_log(session_id, card_index, character_id)
  WHERE session_id IS NOT NULL AND card_index IS NOT NULL;
