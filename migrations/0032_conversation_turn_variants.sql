-- JSON array of {chunkId, replyChunkId}: the NPC line played and the learner reply it expects.
ALTER TABLE conv_scene_turns ADD COLUMN variants TEXT CHECK (variants IS NULL OR (json_valid(variants) AND json_type(variants) = 'array'));
