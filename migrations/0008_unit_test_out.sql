PRAGMA foreign_keys = ON;

CREATE TABLE curriculum_unit_completion_members (
  unit_id INTEGER NOT NULL,
  character_id INTEGER NOT NULL,
  completed_at INTEGER NOT NULL,
  PRIMARY KEY (unit_id, character_id),
  FOREIGN KEY (unit_id, character_id)
    REFERENCES curriculum_unit_members(unit_id, character_id)
    ON DELETE CASCADE
);

CREATE TABLE curriculum_unit_test_attempts (
  session_id TEXT NOT NULL,
  unit_id INTEGER NOT NULL REFERENCES curriculum_units(id) ON DELETE CASCADE,
  expected_answers TEXT NOT NULL CHECK (json_valid(expected_answers) AND json_type(expected_answers) = 'array'),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  consumed_token TEXT,
  PRIMARY KEY (session_id, unit_id)
);

CREATE INDEX idx_curriculum_unit_test_attempts_expiry
  ON curriculum_unit_test_attempts(expires_at);
