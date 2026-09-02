PRAGMA foreign_keys = ON;
DELETE FROM curriculum_unit_test_attempts;
DELETE FROM curriculum_unit_completion_members;
DELETE FROM review_submissions;
DELETE FROM review_log;
DELETE FROM review_states;
DELETE FROM sessions;
DELETE FROM placement_results;
UPDATE profile
SET enabled_tracks = '["kr","jp","cn"]', daily_goal = 40, timezone = 'Asia/Seoul', onyomi_script = 'katakana', theme = 'quiet-technical', xp = 0,
    onboarded_at = NULL, pin_hash = NULL, pin_salt = NULL, pin_iterations = NULL,
    pin_secret = NULL, pin_failures = 0, pin_locked_until = NULL, updated_at = unixepoch() * 1000
WHERE id = 1;

INSERT INTO review_states (
  character_id, track, stability, difficulty, elapsed_days, scheduled_days,
  learning_steps, reps, lapses, state, last_review, due, correct_count, total_count
)
SELECT character_id, track, 1, 5, 1, 1, 0, 1, 0, 2, 0, 0, 0, 1
FROM (
  SELECT character_id, track
  FROM character_tracks
  WHERE track IN ('kr', 'cn')
  ORDER BY character_id DESC, track
  LIMIT 12
);
