-- Throwaway sandbox profiles for portfolio visitors (POST /api/demo/session).
-- Demo rows never count toward the five-profile limit, are never listed, and are
-- purged 24 hours after creation; learner tables cascade on delete.
ALTER TABLE profile ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1));
-- SHA-256 of the creating client's IP; used only for the per-client rate limit.
ALTER TABLE profile ADD COLUMN demo_client TEXT;
ALTER TABLE profile ADD COLUMN demo_writes INTEGER NOT NULL DEFAULT 0 CHECK (demo_writes >= 0);

CREATE INDEX idx_profile_demo_created ON profile(is_demo, created_at);

DROP TRIGGER profile_limit;
CREATE TRIGGER profile_limit BEFORE INSERT ON profile
WHEN NEW.is_demo = 0 AND (SELECT COUNT(*) FROM profile WHERE is_demo = 0) >= 5
BEGIN
  SELECT RAISE(ABORT, 'profile limit reached');
END;

CREATE TRIGGER profile_demo_immutable BEFORE UPDATE OF is_demo ON profile
BEGIN
  SELECT RAISE(ABORT, 'is_demo is immutable');
END;
