PRAGMA foreign_keys = ON;

CREATE TABLE characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  meaning_en TEXT NOT NULL,
  meaning_ko TEXT NOT NULL,
  variants TEXT NOT NULL CHECK (json_valid(variants)),
  stroke_count INTEGER CHECK (stroke_count IS NULL OR stroke_count > 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE character_tracks (
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  track TEXT NOT NULL CHECK (track IN ('kr', 'jp', 'cn')),
  glyph TEXT NOT NULL,
  kr_reading TEXT,
  kr_level TEXT,
  jp_on TEXT,
  jp_kun TEXT,
  jp_kanken TEXT,
  jp_jlpt TEXT,
  cn_pinyin TEXT,
  cn_meaning TEXT,
  cn_hsk TEXT,
  cn_tier TEXT,
  level_ord INTEGER NOT NULL CHECK (level_ord > 0),
  PRIMARY KEY (character_id, track)
);

CREATE TABLE example_sentences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  track TEXT NOT NULL CHECK (track IN ('kr', 'jp', 'cn')),
  text TEXT NOT NULL,
  translation_ko TEXT NOT NULL,
  source TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('textbook', 'past_paper', 'corpus')),
  target_index INTEGER NOT NULL CHECK (target_index >= 0),
  rank INTEGER NOT NULL CHECK (rank >= 0),
  UNIQUE (character_id, track, rank),
  FOREIGN KEY (character_id, track) REFERENCES character_tracks(character_id, track) ON DELETE CASCADE
);

CREATE TABLE curriculum_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track TEXT NOT NULL CHECK (track IN ('kr', 'jp', 'cn')),
  level TEXT NOT NULL,
  ord INTEGER NOT NULL CHECK (ord > 0),
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  UNIQUE (track, level, ord)
);

CREATE TABLE curriculum_unit_members (
  unit_id INTEGER NOT NULL REFERENCES curriculum_units(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL CHECK (ord > 0),
  PRIMARY KEY (unit_id, character_id),
  UNIQUE (unit_id, ord)
);

CREATE INDEX idx_character_tracks_track_level ON character_tracks(track, level_ord);
CREATE INDEX idx_example_sentences_character_track ON example_sentences(character_id, track);
CREATE INDEX idx_curriculum_unit_members_unit_ord ON curriculum_unit_members(unit_id, ord);
