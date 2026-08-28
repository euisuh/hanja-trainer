PRAGMA foreign_keys = ON;

CREATE TABLE review_states (
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
  PRIMARY KEY (character_id, track),
  FOREIGN KEY (character_id, track) REFERENCES character_tracks(character_id, track) ON DELETE CASCADE
);

CREATE TABLE review_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL,
  track TEXT NOT NULL CHECK (track IN ('kr', 'jp', 'cn')),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),
  answered_at INTEGER NOT NULL,
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms >= 0),
  scheduled_days_before INTEGER NOT NULL,
  scheduled_days_after INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('lesson', 'review', 'placement')),
  FOREIGN KEY (character_id, track) REFERENCES character_tracks(character_id, track) ON DELETE CASCADE
);

CREATE INDEX idx_review_states_due ON review_states(due);
CREATE INDEX idx_review_states_track_due ON review_states(track, due);
CREATE INDEX idx_review_log_character_track ON review_log(character_id, track, answered_at);
