ALTER TABLE profile ADD COLUMN theme TEXT NOT NULL DEFAULT 'default'
  CHECK (theme IN ('default', 'quiet-technical'));
