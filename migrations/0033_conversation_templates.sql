-- Slot-substitution drill templates ("___をください。" plus 4-6 noun slots) and FSRS state keyed per template.
CREATE TABLE conv_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  unit_id INTEGER NOT NULL REFERENCES conv_units(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL CHECK (ord > 0),
  ja_template TEXT NOT NULL,
  kana_template TEXT NOT NULL,
  cue_ko TEXT NOT NULL,
  register TEXT NOT NULL CHECK (register IN ('polite', 'casual', 'keigo')),
  pattern_chunk_id INTEGER REFERENCES conv_chunks(id) ON DELETE SET NULL,
  slots TEXT NOT NULL CHECK (json_valid(slots) AND json_type(slots) = 'array'),
  UNIQUE (unit_id, ord)
);

CREATE TABLE conv_template_states (
  profile_id INTEGER NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  template_id INTEGER NOT NULL REFERENCES conv_templates(id) ON DELETE CASCADE,
  stability REAL NOT NULL,
  difficulty REAL NOT NULL,
  elapsed_days INTEGER NOT NULL,
  scheduled_days INTEGER NOT NULL,
  learning_steps INTEGER NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL,
  lapses INTEGER NOT NULL,
  state INTEGER NOT NULL,
  last_review INTEGER,
  due INTEGER NOT NULL,
  correct_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_id, template_id)
);
CREATE INDEX idx_conv_template_states_due ON conv_template_states(profile_id, due);
