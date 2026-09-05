ALTER TABLE profile ADD COLUMN sound_mode TEXT NOT NULL DEFAULT 'on'
  CHECK (sound_mode IN ('on', 'off'));
