PRAGMA foreign_keys = ON;

-- The Japanese curriculum changed semantic scale from Kanken to JLPT.
DELETE FROM curriculum_units WHERE track = 'jp';
DELETE FROM placement_results WHERE track = 'jp';

-- These four legacy rows used jlpt_old fallbacks and are absent from jlpt_new.
DELETE FROM character_tracks
WHERE track = 'jp' AND glyph IN ('分', '里', '身', '畑');
