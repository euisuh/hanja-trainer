ALTER TABLE profile ADD COLUMN pin_hash TEXT;
ALTER TABLE profile ADD COLUMN pin_salt TEXT;
ALTER TABLE profile ADD COLUMN pin_iterations INTEGER;
ALTER TABLE profile ADD COLUMN pin_secret TEXT;
ALTER TABLE profile ADD COLUMN pin_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profile ADD COLUMN pin_locked_until INTEGER;
