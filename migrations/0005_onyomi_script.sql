PRAGMA foreign_keys = ON;

ALTER TABLE profile ADD COLUMN onyomi_script TEXT NOT NULL DEFAULT 'katakana'
  CHECK (onyomi_script IN ('katakana', 'hiragana'));
