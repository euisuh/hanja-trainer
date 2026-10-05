PRAGMA foreign_keys = OFF;

-- Production has no attempts yet. Keep this count visible before rebuilding the
-- table so a future deploy does not discard attempt history unnoticed.
SELECT COUNT(*) AS conv_attempt_count FROM conv_attempts;

CREATE TABLE conv_chunks_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track TEXT NOT NULL DEFAULT 'jp' CHECK (track IN ('jp')),
  key TEXT NOT NULL DEFAULT '',
  ja TEXT NOT NULL,
  kana TEXT NOT NULL,
  ko_cue TEXT NOT NULL,
  register TEXT NOT NULL CHECK (register IN ('polite', 'casual', 'keigo')),
  role TEXT NOT NULL CHECK (role IN ('say', 'hear')),
  source_kind TEXT NOT NULL,
  source_ref TEXT NOT NULL CHECK (length(source_ref) > 0),
  audio_key TEXT NOT NULL,
  retired_at INTEGER,
  -- Temporary compatibility for readers seeded before this migration. New
  -- content belongs to conv_unit_chunks; these columns will be removed with
  -- the reader migration.
  unit_id INTEGER REFERENCES conv_units(id) ON DELETE CASCADE,
  ord INTEGER CHECK (ord > 0),
  UNIQUE (track, ja, role)
);

INSERT INTO conv_chunks_new (
  id, track, key, ja, kana, ko_cue, register, role, source_kind, source_ref,
  audio_key, unit_id, ord
)
SELECT
  id, 'jp', printf('legacy-%d', id), ja, kana, ko_cue, register, role,
  source_kind, source_ref, audio_key, unit_id, ord
FROM conv_chunks;

CREATE TABLE conv_unit_chunks (
  unit_id INTEGER NOT NULL REFERENCES conv_units(id) ON DELETE CASCADE,
  chunk_id INTEGER NOT NULL REFERENCES conv_chunks_new(id) ON DELETE RESTRICT,
  ord INTEGER NOT NULL CHECK (ord > 0),
  PRIMARY KEY (unit_id, chunk_id),
  UNIQUE (unit_id, ord)
);

INSERT INTO conv_unit_chunks (unit_id, chunk_id, ord)
SELECT unit_id, id, ord FROM conv_chunks;

CREATE TABLE conv_attempts_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  client_attempt_id TEXT NOT NULL CHECK (length(client_attempt_id) BETWEEN 1 AND 128),
  chunk_id INTEGER NOT NULL REFERENCES conv_chunks_new(id) ON DELETE RESTRICT,
  scene_id INTEGER REFERENCES conv_scenes(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('say', 'hear')),
  grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 4),
  answered_at INTEGER NOT NULL,
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  loop TEXT NOT NULL DEFAULT 'unknown' CHECK (loop IN ('unknown', 'echo', 'shadow', 'drill', 'roleplay', 'free')),
  input TEXT NOT NULL DEFAULT 'unknown' CHECK (input IN ('unknown', 'voice', 'tap', 'keyboard')),
  hints INTEGER NOT NULL DEFAULT 0 CHECK (hints >= 0),
  replays INTEGER NOT NULL DEFAULT 0 CHECK (replays >= 0),
  UNIQUE (profile_id, client_attempt_id)
);

INSERT INTO conv_attempts_new (
  id, profile_id, client_attempt_id, chunk_id, scene_id, role, grade,
  answered_at, latency_ms, loop, input, hints, replays
)
SELECT
  id, profile_id, client_attempt_id, chunk_id, scene_id, role, grade,
  answered_at, latency_ms, loop, input, hints, replays
FROM conv_attempts;

DROP TABLE conv_attempts;
DROP TABLE conv_chunks;
ALTER TABLE conv_chunks_new RENAME TO conv_chunks;
ALTER TABLE conv_attempts_new RENAME TO conv_attempts;

CREATE INDEX idx_conv_chunks_track_role ON conv_chunks(track, role);
CREATE UNIQUE INDEX idx_conv_chunks_track_key ON conv_chunks(track, key) WHERE key <> '';
CREATE INDEX idx_conv_unit_chunks_unit_ord ON conv_unit_chunks(unit_id, ord);
CREATE INDEX idx_conv_attempts_profile_time ON conv_attempts(profile_id, answered_at);
CREATE INDEX idx_conv_attempts_chunk_time ON conv_attempts(profile_id, chunk_id, answered_at);

PRAGMA foreign_keys = ON;
