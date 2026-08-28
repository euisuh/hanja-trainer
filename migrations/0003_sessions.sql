PRAGMA foreign_keys = ON;

ALTER TABLE review_log ADD COLUMN session_id TEXT;
ALTER TABLE review_log ADD COLUMN card_index INTEGER;

CREATE UNIQUE INDEX idx_review_log_submission
  ON review_log(session_id, card_index)
  WHERE session_id IS NOT NULL AND card_index IS NOT NULL;

CREATE TABLE review_submissions (
  session_id TEXT NOT NULL,
  card_index INTEGER NOT NULL CHECK (card_index >= 0),
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  PRIMARY KEY (session_id, card_index)
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL CHECK (mode IN ('lesson', 'review', 'placement')),
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  answered INTEGER NOT NULL CHECK (answered >= 0),
  correct INTEGER NOT NULL CHECK (correct >= 0 AND correct <= answered),
  best_combo INTEGER NOT NULL CHECK (best_combo >= 0),
  xp INTEGER NOT NULL CHECK (xp >= 0)
);

CREATE INDEX idx_sessions_ended_at ON sessions(ended_at);
