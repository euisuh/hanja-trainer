ALTER TABLE curriculum_units ADD COLUMN level_ord INTEGER NOT NULL DEFAULT 0 CHECK (level_ord >= 0);
