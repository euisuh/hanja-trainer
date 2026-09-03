-- 0015 added curriculum_units.level_ord with DEFAULT 0 and no backfill. Migration
-- apply and reseed (`npm run seed:remote`) are separate manual steps, so any window
-- between them left every unit's level_ord at 0 -- collapsing placement's "active
-- unit" lookup to the last unit for every learner. Backfill existing rows here as
-- its own migration (0015 already shipped; editing an applied migration is a no-op
-- against a DB that already ran it).
--
-- Mirrors curriculumLevelOrd() in scripts/seed.ts: cn units order by their own level
-- (they intentionally repeat earlier-band characters), kr/jp units order by their
-- members' minimum character_tracks.level_ord.
UPDATE curriculum_units
SET level_ord = CASE
  WHEN track = 'cn' THEN CASE level
    WHEN 'HSK 1' THEN 1 WHEN 'HSK 2' THEN 2 WHEN 'HSK 3' THEN 3
    WHEN 'HSK 4' THEN 4 WHEN 'HSK 5' THEN 5 WHEN 'HSK 6' THEN 6
    WHEN 'HSK 7-9' THEN 7 ELSE level_ord END
  ELSE COALESCE((
    SELECT MIN(ct.level_ord)
    FROM curriculum_unit_members cum
    JOIN character_tracks ct ON ct.character_id = cum.character_id AND ct.track = curriculum_units.track
    WHERE cum.unit_id = curriculum_units.id
  ), level_ord)
END
WHERE level_ord = 0;
