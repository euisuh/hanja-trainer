CREATE TABLE conv_checkins (
  profile_id INTEGER NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES conv_units(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  note TEXT NOT NULL CHECK (instr(note, char(10)) = 0 AND instr(note, char(13)) = 0),
  PRIMARY KEY (profile_id, unit_id)
);
CREATE INDEX idx_conv_checkins_profile_at ON conv_checkins(profile_id, at);
