PRAGMA foreign_keys = ON;

CREATE TABLE profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled_tracks TEXT NOT NULL DEFAULT '["kr","jp","cn"]' CHECK (json_valid(enabled_tracks)),
  daily_goal INTEGER NOT NULL DEFAULT 40 CHECK (daily_goal BETWEEN 10 AND 120 AND daily_goal % 10 = 0),
  timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  onboarded_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

INSERT INTO profile (id, xp) SELECT 1, COALESCE(SUM(xp), 0) FROM sessions;

CREATE TABLE placement_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track TEXT NOT NULL CHECK (track IN ('kr', 'jp', 'cn')),
  level_ord INTEGER NOT NULL CHECK (level_ord > 0),
  level_badge TEXT NOT NULL,
  accuracy REAL NOT NULL CHECK (accuracy BETWEEN 0 AND 100),
  detail TEXT NOT NULL,
  taken_at INTEGER NOT NULL
);

CREATE INDEX idx_placement_results_track_taken ON placement_results(track, taken_at DESC, id DESC);
