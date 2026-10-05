ALTER TABLE profile ADD COLUMN appearance TEXT NOT NULL DEFAULT 'classic' CHECK (appearance IN ('classic','notebook'));
