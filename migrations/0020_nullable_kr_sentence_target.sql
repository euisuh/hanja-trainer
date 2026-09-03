PRAGMA defer_foreign_keys = ON;

CREATE TABLE example_sentences_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  track TEXT NOT NULL CHECK (track IN ('kr', 'jp', 'cn')),
  text TEXT NOT NULL,
  reading TEXT,
  translation_ko TEXT NOT NULL,
  source TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('textbook', 'past_paper', 'corpus')),
  target_index INTEGER CHECK (target_index IS NULL OR target_index >= 0),
  rank INTEGER NOT NULL CHECK (rank >= 0),
  UNIQUE (character_id, track, rank),
  CHECK (track = 'kr' OR target_index IS NOT NULL),
  FOREIGN KEY (character_id, track) REFERENCES character_tracks(character_id, track) ON DELETE CASCADE
);

INSERT INTO example_sentences_new (
  id, character_id, track, text, reading, translation_ko, source, source_kind,
  target_index, rank
)
SELECT
  id, character_id, track, text, reading, translation_ko, source, source_kind,
  target_index, rank
FROM example_sentences;

DROP TABLE example_sentences;
ALTER TABLE example_sentences_new RENAME TO example_sentences;

CREATE INDEX idx_example_sentences_character_track ON example_sentences(character_id, track);

PRAGMA defer_foreign_keys = OFF;
PRAGMA foreign_keys = ON;
