import type { ConversationChunk, ConversationChunkState, ConversationScene, ConversationSceneTurn, ConversationUnit } from "../../shared/types";

type ConversationChunkPayload = ConversationChunk & { audioUrl: string };
type ConversationScenePayload = ConversationScene & { turns: ConversationSceneTurn[] };
type ConversationUnitsResponse = { units: ConversationUnit[] };
type ConversationUnitResponse = {
  unit: ConversationUnit;
  chunks: ConversationChunkPayload[];
  scenes: ConversationScenePayload[];
};
type ConversationDueChunk = ConversationChunkPayload & Omit<ConversationChunkState, "profileId" | "chunkId" | "role">;
type ConversationDueResponse = { chunks: ConversationDueChunk[] };

type UnitRow = {
  id: number;
  track: "jp";
  ord: number;
  title_ko: string;
  goal_ko: string;
};

type ChunkRow = {
  id: number;
  unit_id: number;
  ord: number;
  ja: string;
  kana: string;
  ko_cue: string;
  register: ConversationChunk["register"];
  role: ConversationChunk["role"];
  source_kind: string;
  source_ref: string;
  audio_key: string;
};

type SceneRow = {
  id: number;
  unit_id: number;
  ord: number;
  title_ko: string;
  setting_ko: string;
  goal_ko: string;
};

type SceneTurnRow = {
  scene_id: number;
  ord: number;
  speaker: ConversationSceneTurn["speaker"];
  chunk_ids: string;
};

type DueRow = ChunkRow & {
  profile_id: number;
  chunk_id: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: number | null;
  due: number;
  correct_count: number;
  total_count: number;
};

function unit(row: UnitRow): ConversationUnit {
  return { id: row.id, track: row.track, ord: row.ord, titleKo: row.title_ko, goalKo: row.goal_ko };
}

function chunk(row: ChunkRow): ConversationChunkPayload {
  return {
    id: row.id,
    unitId: row.unit_id,
    ord: row.ord,
    ja: row.ja,
    kana: row.kana,
    koCue: row.ko_cue,
    register: row.register,
    role: row.role,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    audioKey: row.audio_key,
    audioUrl: `/api/audio/${row.audio_key}`,
  };
}

function scene(row: SceneRow): ConversationScene {
  return { id: row.id, unitId: row.unit_id, ord: row.ord, titleKo: row.title_ko, settingKo: row.setting_ko, goalKo: row.goal_ko };
}

function state(row: DueRow): Omit<ConversationChunkState, "profileId" | "chunkId" | "role"> {
  return {
    stability: row.stability,
    difficulty: row.difficulty,
    elapsedDays: row.elapsed_days,
    scheduledDays: row.scheduled_days,
    learningSteps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    lastReview: row.last_review,
    due: row.due,
    correctCount: row.correct_count,
    totalCount: row.total_count,
  };
}

function chunkIds(value: string): number[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every(Number.isSafeInteger)) throw new Error("conversation scene turn has invalid chunk IDs");
  return parsed;
}

export async function getConversationUnits(db: D1Database): Promise<ConversationUnitsResponse> {
  const result = await db.prepare("SELECT id, track, ord, title_ko, goal_ko FROM conv_units ORDER BY ord, id").all<UnitRow>();
  return { units: result.results.map(unit) };
}

export async function getConversationUnit(db: D1Database, unitId: number): Promise<ConversationUnitResponse | null> {
  const unitRow = await db.prepare("SELECT id, track, ord, title_ko, goal_ko FROM conv_units WHERE id = ?1").bind(unitId).first<UnitRow>();
  if (!unitRow) return null;
  const [chunkResult, sceneResult, turnResult] = await Promise.all([
    db.prepare("SELECT id, unit_id, ord, ja, kana, ko_cue, register, role, source_kind, source_ref, audio_key FROM conv_chunks WHERE unit_id = ?1 ORDER BY ord, id").bind(unitId).all<ChunkRow>(),
    db.prepare("SELECT id, unit_id, ord, title_ko, setting_ko, goal_ko FROM conv_scenes WHERE unit_id = ?1 ORDER BY ord, id").bind(unitId).all<SceneRow>(),
    db.prepare(`
      SELECT cst.scene_id, cst.ord, cst.speaker, cst.chunk_ids
      FROM conv_scene_turns cst
      JOIN conv_scenes cs ON cs.id = cst.scene_id
      WHERE cs.unit_id = ?1
      ORDER BY cs.ord, cs.id, cst.ord
    `).bind(unitId).all<SceneTurnRow>(),
  ]);
  const turns = new Map<number, ConversationSceneTurn[]>();
  for (const row of turnResult.results) {
    const entries = turns.get(row.scene_id) ?? [];
    entries.push({ sceneId: row.scene_id, ord: row.ord, speaker: row.speaker, chunkIds: chunkIds(row.chunk_ids) });
    turns.set(row.scene_id, entries);
  }
  return {
    unit: unit(unitRow),
    chunks: chunkResult.results.map(chunk),
    scenes: sceneResult.results.map((row) => ({ ...scene(row), turns: turns.get(row.id) ?? [] })),
  };
}

export async function getDueConversationChunks(db: D1Database, profileId: number, now = Date.now()): Promise<ConversationDueResponse> {
  const result = await db.prepare(`
    SELECT c.id, c.unit_id, c.ord, c.ja, c.kana, c.ko_cue, c.register, c.role, c.source_kind, c.source_ref, c.audio_key,
      ccs.profile_id, ccs.chunk_id, ccs.stability, ccs.difficulty, ccs.elapsed_days, ccs.scheduled_days, ccs.learning_steps,
      ccs.reps, ccs.lapses, ccs.state, ccs.last_review, ccs.due, ccs.correct_count, ccs.total_count
    FROM conv_chunk_states ccs
    JOIN conv_chunks c ON c.id = ccs.chunk_id
    WHERE ccs.profile_id = ?1 AND ccs.due <= ?2
    ORDER BY ccs.due, ccs.chunk_id, ccs.role
  `).bind(profileId, now).all<DueRow>();
  return { chunks: result.results.map((row) => ({ ...chunk(row), ...state(row) })) };
}
