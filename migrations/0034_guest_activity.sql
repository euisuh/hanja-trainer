-- Server-owned last-activity time for guest (is_demo) profiles. Only worker/api/demo.ts
-- writes it, always from the Worker clock; updated_at stays free for other code.
ALTER TABLE profile ADD COLUMN demo_active_at INTEGER;
UPDATE profile SET demo_active_at = created_at WHERE is_demo = 1;
