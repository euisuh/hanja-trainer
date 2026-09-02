PRAGMA foreign_keys = ON;

-- The frozen Korean selection was rebalanced and every retained row gained a
-- Hangul gloss. Clear the old snapshot before the normal content seed runs.
DELETE FROM example_sentences WHERE track = 'kr';
