PRAGMA defer_foreign_keys = ON;

CREATE TABLE profile_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  enabled_tracks TEXT NOT NULL DEFAULT '["kr","jp","cn"]' CHECK (json_valid(enabled_tracks)),
  daily_goal INTEGER NOT NULL DEFAULT 40 CHECK (daily_goal BETWEEN 10 AND 120 AND daily_goal % 10 = 0),
  timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  onboarded_at INTEGER,
  onyomi_script TEXT NOT NULL DEFAULT 'katakana' CHECK (onyomi_script IN ('katakana', 'hiragana')),
  theme TEXT NOT NULL DEFAULT 'quiet-technical' CHECK (theme IN ('default', 'quiet-technical')),
  pin_hash TEXT,
  pin_salt TEXT,
  pin_iterations INTEGER,
  pin_secret TEXT,
  pin_failures INTEGER NOT NULL DEFAULT 0,
  pin_locked_until INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

INSERT INTO profile_new (
  id, name, is_admin, enabled_tracks, daily_goal, timezone, xp, onboarded_at,
  onyomi_script, theme, pin_hash, pin_salt, pin_iterations, pin_secret,
  pin_failures, pin_locked_until, created_at, updated_at
)
SELECT
  id, '나', 1, enabled_tracks, daily_goal, timezone, xp, onboarded_at,
  onyomi_script, theme, pin_hash, pin_salt, pin_iterations, pin_secret,
  pin_failures, pin_locked_until, created_at, updated_at
FROM profile;

DROP TABLE profile;
ALTER TABLE profile_new RENAME TO profile;

CREATE TABLE review_states_new (
  profile_id INTEGER NOT NULL DEFAULT 1 REFERENCES profile(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL,
  track TEXT NOT NULL CHECK (track IN ('kr', 'jp', 'cn')),
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
  PRIMARY KEY (profile_id, character_id, track),
  FOREIGN KEY (character_id, track) REFERENCES character_tracks(character_id, track) ON DELETE CASCADE
);

INSERT INTO review_states_new (
  profile_id, character_id, track, stability, difficulty, elapsed_days,
  scheduled_days, learning_steps, reps, lapses, state, last_review, due,
  correct_count, total_count
)
SELECT
  1, character_id, track, stability, difficulty, elapsed_days,
  scheduled_days, learning_steps, reps, lapses, state, last_review, due,
  correct_count, total_count
FROM review_states;

DROP TABLE review_states;
ALTER TABLE review_states_new RENAME TO review_states;

CREATE TABLE review_log_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL DEFAULT 1 REFERENCES profile(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL,
  track TEXT NOT NULL CHECK (track IN ('kr', 'jp', 'cn')),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),
  answered_at INTEGER NOT NULL,
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms >= 0),
  scheduled_days_before INTEGER NOT NULL,
  scheduled_days_after INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('lesson', 'review', 'placement')),
  session_id TEXT,
  card_index INTEGER,
  skipped INTEGER NOT NULL DEFAULT 0 CHECK (skipped IN (0, 1)),
  FOREIGN KEY (character_id, track) REFERENCES character_tracks(character_id, track) ON DELETE CASCADE
);

INSERT INTO review_log_new (
  id, profile_id, character_id, track, rating, answered_at, correct, elapsed_ms,
  scheduled_days_before, scheduled_days_after, mode, session_id, card_index, skipped
)
SELECT
  id, 1, character_id, track, rating, answered_at, correct, elapsed_ms,
  scheduled_days_before, scheduled_days_after, mode, session_id, card_index, skipped
FROM review_log;

DROP TABLE review_log;
ALTER TABLE review_log_new RENAME TO review_log;

CREATE TABLE review_submissions_new (
  profile_id INTEGER NOT NULL DEFAULT 1 REFERENCES profile(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  card_index INTEGER NOT NULL CHECK (card_index >= 0),
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  PRIMARY KEY (profile_id, session_id, card_index)
);

INSERT INTO review_submissions_new (profile_id, session_id, card_index, response_json)
SELECT 1, session_id, card_index, response_json FROM review_submissions;

DROP TABLE review_submissions;
ALTER TABLE review_submissions_new RENAME TO review_submissions;

CREATE TABLE sessions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL DEFAULT 1 REFERENCES profile(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('lesson', 'review', 'placement')),
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  answered INTEGER NOT NULL CHECK (answered >= 0),
  correct INTEGER NOT NULL CHECK (correct >= 0 AND correct <= answered),
  best_combo INTEGER NOT NULL CHECK (best_combo >= 0),
  xp INTEGER NOT NULL CHECK (xp >= 0),
  skipped INTEGER NOT NULL DEFAULT 0 CHECK (skipped >= 0 AND skipped <= answered)
);

INSERT INTO sessions_new (
  id, profile_id, mode, started_at, ended_at, answered, correct, best_combo, xp, skipped
)
SELECT id, 1, mode, started_at, ended_at, answered, correct, best_combo, xp, skipped
FROM sessions;

DROP TABLE sessions;
ALTER TABLE sessions_new RENAME TO sessions;

CREATE TABLE placement_results_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL DEFAULT 1 REFERENCES profile(id) ON DELETE CASCADE,
  track TEXT NOT NULL CHECK (track IN ('kr', 'jp', 'cn')),
  level_ord INTEGER NOT NULL CHECK (level_ord > 0),
  level_badge TEXT NOT NULL,
  accuracy REAL NOT NULL CHECK (accuracy BETWEEN 0 AND 100),
  detail TEXT NOT NULL,
  taken_at INTEGER NOT NULL
);

INSERT INTO placement_results_new (
  id, profile_id, track, level_ord, level_badge, accuracy, detail, taken_at
)
SELECT id, 1, track, level_ord, level_badge, accuracy, detail, taken_at
FROM placement_results;

DROP TABLE placement_results;
ALTER TABLE placement_results_new RENAME TO placement_results;

CREATE TABLE curriculum_unit_completion_members_new (
  profile_id INTEGER NOT NULL DEFAULT 1 REFERENCES profile(id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL,
  character_id INTEGER NOT NULL,
  completed_at INTEGER NOT NULL,
  PRIMARY KEY (profile_id, unit_id, character_id),
  FOREIGN KEY (unit_id, character_id)
    REFERENCES curriculum_unit_members(unit_id, character_id)
    ON DELETE CASCADE
);

INSERT INTO curriculum_unit_completion_members_new (
  profile_id, unit_id, character_id, completed_at
)
SELECT 1, unit_id, character_id, completed_at
FROM curriculum_unit_completion_members;

DROP TABLE curriculum_unit_completion_members;
ALTER TABLE curriculum_unit_completion_members_new RENAME TO curriculum_unit_completion_members;

CREATE TABLE curriculum_unit_test_attempts_new (
  profile_id INTEGER NOT NULL DEFAULT 1 REFERENCES profile(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  unit_id INTEGER NOT NULL REFERENCES curriculum_units(id) ON DELETE CASCADE,
  expected_answers TEXT NOT NULL CHECK (json_valid(expected_answers) AND json_type(expected_answers) = 'array'),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  consumed_token TEXT,
  PRIMARY KEY (profile_id, session_id, unit_id)
);

INSERT INTO curriculum_unit_test_attempts_new (
  profile_id, session_id, unit_id, expected_answers, created_at, expires_at,
  consumed_at, consumed_token
)
SELECT
  1, session_id, unit_id, expected_answers, created_at, expires_at,
  consumed_at, consumed_token
FROM curriculum_unit_test_attempts;

DROP TABLE curriculum_unit_test_attempts;
ALTER TABLE curriculum_unit_test_attempts_new RENAME TO curriculum_unit_test_attempts;

CREATE INDEX idx_review_states_due ON review_states(profile_id, due);
CREATE INDEX idx_review_states_track_due ON review_states(profile_id, track, due);
CREATE INDEX idx_review_log_character_track ON review_log(profile_id, character_id, track, answered_at);
CREATE UNIQUE INDEX idx_review_log_submission
  ON review_log(profile_id, session_id, card_index, character_id)
  WHERE session_id IS NOT NULL AND card_index IS NOT NULL;
CREATE INDEX idx_review_log_answered_at ON review_log(profile_id, answered_at);
CREATE INDEX idx_sessions_ended_at ON sessions(profile_id, ended_at);
CREATE INDEX idx_placement_results_track_taken
  ON placement_results(profile_id, track, taken_at DESC, id DESC);
CREATE INDEX idx_curriculum_unit_test_attempts_expiry
  ON curriculum_unit_test_attempts(profile_id, expires_at);
CREATE UNIQUE INDEX idx_profile_single_admin ON profile(is_admin) WHERE is_admin = 1;

CREATE TRIGGER profile_limit BEFORE INSERT ON profile
WHEN (SELECT COUNT(*) FROM profile) >= 5
BEGIN
  SELECT RAISE(ABORT, 'profile limit reached');
END;

CREATE TRIGGER profile_admin_immutable BEFORE UPDATE OF is_admin ON profile
BEGIN
  SELECT RAISE(ABORT, 'is_admin is immutable');
END;

CREATE TRIGGER profile_admin_undeletable BEFORE DELETE ON profile
WHEN OLD.is_admin = 1
BEGIN
  SELECT RAISE(ABORT, 'the admin profile cannot be deleted');
END;

PRAGMA defer_foreign_keys = OFF;
