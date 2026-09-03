PRAGMA defer_foreign_keys = ON;

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
  mode TEXT NOT NULL CHECK (mode IN ('lesson', 'review', 'level-review', 'placement')),
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
  id, profile_id, character_id, track, rating, answered_at, correct, elapsed_ms,
  scheduled_days_before, scheduled_days_after, mode, session_id, card_index, skipped
FROM review_log;

DROP TABLE review_log;
ALTER TABLE review_log_new RENAME TO review_log;

CREATE INDEX idx_review_log_character_track ON review_log(profile_id, character_id, track, answered_at);
CREATE UNIQUE INDEX idx_review_log_submission
  ON review_log(profile_id, session_id, card_index, character_id)
  WHERE session_id IS NOT NULL AND card_index IS NOT NULL;
CREATE INDEX idx_review_log_answered_at ON review_log(profile_id, answered_at);

CREATE TABLE sessions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL DEFAULT 1 REFERENCES profile(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('lesson', 'review', 'level-review', 'placement')),
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
SELECT id, profile_id, mode, started_at, ended_at, answered, correct, best_combo, xp, skipped
FROM sessions;

DROP TABLE sessions;
ALTER TABLE sessions_new RENAME TO sessions;

CREATE INDEX idx_sessions_ended_at ON sessions(profile_id, ended_at);
