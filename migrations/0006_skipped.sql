PRAGMA foreign_keys = ON;

ALTER TABLE review_log ADD COLUMN skipped INTEGER NOT NULL DEFAULT 0 CHECK (skipped IN (0, 1));
ALTER TABLE sessions ADD COLUMN skipped INTEGER NOT NULL DEFAULT 0 CHECK (skipped >= 0 AND skipped <= answered);
