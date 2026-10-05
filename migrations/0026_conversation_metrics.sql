ALTER TABLE conv_attempts ADD COLUMN loop TEXT NOT NULL DEFAULT 'unknown'
  CHECK (loop IN ('unknown', 'echo', 'shadow', 'drill', 'roleplay', 'free'));
ALTER TABLE conv_attempts ADD COLUMN input TEXT NOT NULL DEFAULT 'unknown'
  CHECK (input IN ('unknown', 'voice', 'tap', 'keyboard'));
ALTER TABLE conv_attempts ADD COLUMN hints INTEGER NOT NULL DEFAULT 0 CHECK (hints >= 0);
ALTER TABLE conv_attempts ADD COLUMN replays INTEGER NOT NULL DEFAULT 0 CHECK (replays >= 0);
