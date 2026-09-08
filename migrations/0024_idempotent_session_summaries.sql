ALTER TABLE sessions ADD COLUMN client_session_id TEXT
  CHECK (client_session_id IS NULL OR length(client_session_id) BETWEEN 1 AND 128);

CREATE UNIQUE INDEX idx_sessions_client_session_id
  ON sessions(profile_id, client_session_id);

CREATE TRIGGER sessions_credit_keyed_xp
AFTER INSERT ON sessions
WHEN NEW.client_session_id IS NOT NULL
BEGIN
  UPDATE profile
  SET xp = xp + NEW.xp, updated_at = MAX(updated_at, NEW.ended_at)
  WHERE id = NEW.profile_id;
END;
