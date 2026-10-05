PRAGMA foreign_keys = ON;

CREATE TABLE conv_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track TEXT NOT NULL DEFAULT 'jp' CHECK (track IN ('jp')),
  ord INTEGER NOT NULL CHECK (ord > 0),
  title_ko TEXT NOT NULL,
  goal_ko TEXT NOT NULL,
  UNIQUE (track, ord)
);

CREATE TABLE conv_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL REFERENCES conv_units(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL CHECK (ord > 0),
  ja TEXT NOT NULL,
  kana TEXT NOT NULL,
  ko_cue TEXT NOT NULL,
  register TEXT NOT NULL CHECK (register IN ('polite', 'casual', 'keigo')),
  role TEXT NOT NULL CHECK (role IN ('say', 'hear')),
  source_kind TEXT NOT NULL,
  source_ref TEXT NOT NULL CHECK (length(source_ref) > 0),
  audio_key TEXT NOT NULL,
  UNIQUE (unit_id, ord),
  UNIQUE (unit_id, ja, role)
);
CREATE INDEX idx_conv_chunks_unit_role_ord ON conv_chunks(unit_id, role, ord);

CREATE TABLE conv_scenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL REFERENCES conv_units(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL CHECK (ord > 0),
  title_ko TEXT NOT NULL,
  setting_ko TEXT NOT NULL,
  goal_ko TEXT NOT NULL,
  UNIQUE (unit_id, ord)
);

CREATE TABLE conv_scene_turns (
  scene_id INTEGER NOT NULL REFERENCES conv_scenes(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL CHECK (ord > 0),
  speaker TEXT NOT NULL CHECK (speaker IN ('npc', 'learner')),
  chunk_ids TEXT NOT NULL CHECK (json_valid(chunk_ids) AND json_type(chunk_ids) = 'array'),
  PRIMARY KEY (scene_id, ord)
);

CREATE TABLE conv_chunk_states (
  profile_id INTEGER NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  chunk_id INTEGER NOT NULL REFERENCES conv_chunks(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('say', 'hear')),
  stability REAL NOT NULL,
  difficulty REAL NOT NULL,
  elapsed_days INTEGER NOT NULL,
  scheduled_days INTEGER NOT NULL,
  learning_steps INTEGER NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL,
  lapses INTEGER NOT NULL,
  state INTEGER NOT NULL,
  last_review INTEGER,
  due INTEGER NOT NULL,
  correct_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_id, chunk_id, role)
);
CREATE INDEX idx_conv_chunk_states_due ON conv_chunk_states(profile_id, role, due);

CREATE TABLE conv_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  client_attempt_id TEXT NOT NULL CHECK (length(client_attempt_id) BETWEEN 1 AND 128),
  chunk_id INTEGER NOT NULL REFERENCES conv_chunks(id) ON DELETE CASCADE,
  scene_id INTEGER REFERENCES conv_scenes(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('say', 'hear')),
  grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 4),
  answered_at INTEGER NOT NULL,
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  UNIQUE (profile_id, client_attempt_id)
);
CREATE INDEX idx_conv_attempts_profile_time ON conv_attempts(profile_id, answered_at);
CREATE INDEX idx_conv_attempts_chunk_time ON conv_attempts(profile_id, chunk_id, answered_at);
