ALTER TABLE profile ADD COLUMN recovery_hash TEXT;
ALTER TABLE profile ADD COLUMN recovery_salt TEXT;
ALTER TABLE profile ADD COLUMN recovery_iterations INTEGER;
