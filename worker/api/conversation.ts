/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type, anti-slop/no-unknown-parameters, anti-slop/require-safety-comment-for-type-assertion -- Check-in parser validates the untyped JSON request boundary before database writes. */
import { composeTalkSession } from "../../shared/talkSession";
import type { ConversationSessionItem, ConversationTemplatePayload, ConversationCheckin, ConversationProgressResponse, ConversationSessionResponse, SubmitConversationCheckinRequest } from "../../shared/api";
import type { ConversationChunk, ConversationChunkState, ConversationScene, ConversationSceneTurn, ConversationTurnVariant, ConversationUnit } from "../../shared/types";
import { zonedDayKey } from "./sessions";

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

type ProgressRow = Pick<ChunkRow, "id" | "unit_id" | "ord" | "ja" | "kana" | "ko_cue" | "source_kind" | "source_ref"> & { answered_at: number | null; grade: number | null };
type CheckinRow = { unit_id: number; at: number; note: string };
type TimezoneRow = { timezone: string };

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
  note_ko: string | null;
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
  variants: string | null;
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

type SessionChunkRow = ChunkRow & { due: number | null };
type TemplateRow = {
  id: number;
  key: string;
  unit_id: number;
  ord: number;
  ja_template: string;
  kana_template: string;
  cue_ko: string;
  register: ConversationChunk["register"];
  pattern_chunk_id: number;
  slots: string;
  due: number | null;
};

function template(row: TemplateRow): ConversationTemplatePayload {
  return { id: row.id, key: row.key, unitId: row.unit_id, ord: row.ord, jaTemplate: row.ja_template, kanaTemplate: row.kana_template, cueKo: row.cue_ko, register: row.register, patternChunkId: row.pattern_chunk_id, slots: JSON.parse(row.slots) as ConversationTemplatePayload["slots"] };
}

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
    noteKo: row.note_ko ?? undefined,
    audioKey: row.audio_key,
    audioUrl: `/api/audio/jp/${row.audio_key}.mp3`,
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

function sceneTurn(row: SceneTurnRow): ConversationSceneTurn {
  const turn: ConversationSceneTurn = { sceneId: row.scene_id, ord: row.ord, speaker: row.speaker, chunkIds: chunkIds(row.chunk_ids) };
  if (row.variants === null) return turn;
  const parsed: unknown = JSON.parse(row.variants);
  if (!Array.isArray(parsed) || !parsed.every((item) => Number.isSafeInteger(item?.chunkId) && Number.isSafeInteger(item?.replyChunkId))) throw new Error("conversation scene turn has invalid variants");
  return { ...turn, variants: parsed as ConversationTurnVariant[] };
}

export async function getConversationUnits(db: D1Database): Promise<ConversationUnitsResponse> {
  const result = await db.prepare("SELECT id, track, ord, title_ko, goal_ko FROM conv_units ORDER BY ord, id").all<UnitRow>();
  return { units: result.results.map(unit) };
}

export async function getConversationProgress(db: D1Database, profileId: number): Promise<ConversationProgressResponse> {
  const [profile, unitResult, phraseResult, checkinResult] = await Promise.all([
    db.prepare("SELECT timezone FROM profile WHERE id = ?1").bind(profileId).first<TimezoneRow>(),
    db.prepare("SELECT id, ord, title_ko, goal_ko FROM conv_units ORDER BY ord, id").all<Pick<UnitRow, "id" | "ord" | "title_ko" | "goal_ko">>(),
    db.prepare(`
      SELECT c.id, cuc.unit_id, cuc.ord, c.ja, c.kana, c.ko_cue, c.source_kind, c.source_ref, a.answered_at, a.grade
      FROM conv_unit_chunks cuc
      JOIN conv_chunks c ON c.id = cuc.chunk_id AND c.retired_at IS NULL
      LEFT JOIN conv_attempts a ON a.chunk_id = c.id AND a.profile_id = ?1 AND a.input = 'voice'
      WHERE c.role = 'say' AND cuc.ord < 1000000
      ORDER BY cuc.unit_id, cuc.ord, c.id, a.answered_at, a.id
    `).bind(profileId).all<ProgressRow>(),
    db.prepare("SELECT unit_id, at, note FROM conv_checkins WHERE profile_id = ?1").bind(profileId).all<CheckinRow>(),
  ]);
  if (!profile?.timezone) throw new Error("Profile row is missing");
  const phrases = new Map<number, ConversationProgressResponse["phrases"][number] & { days: Set<string> }>();
  for (const row of phraseResult.results) {
    const phraseKey = row.unit_id * 1_000_000 + row.id;
    const phrase = phrases.get(phraseKey) ?? { id: row.id, unitId: row.unit_id, ord: row.ord, ja: row.ja, kana: row.kana, koCue: row.ko_cue, sourceKind: row.source_kind, sourceRef: row.source_ref, spokenDays: 0, againCount: 0, days: new Set<string>() };
    if (row.answered_at !== null) phrase.days.add(zonedDayKey(new Date(row.answered_at), profile.timezone));
    if (row.grade === 1) phrase.againCount += 1;
    phrases.set(phraseKey, phrase);
  }
  const phraseList = [...phrases.values()].map(({ days, ...phrase }) => ({ ...phrase, spokenDays: days.size }));
  const checkins = new Map(checkinResult.results.map((checkin) => [checkin.unit_id, { unitId: checkin.unit_id, at: checkin.at, note: checkin.note }]));
  return {
    units: unitResult.results.map((row) => {
      const unitPhrases = phraseList.filter((phrase) => phrase.unitId === row.id);
      return { id: row.id, ord: row.ord, titleKo: row.title_ko, goalKo: row.goal_ko, phraseCount: unitPhrases.length, completedPhraseCount: unitPhrases.filter((phrase) => phrase.spokenDays >= 2).length, checkin: checkins.get(row.id) ?? null };
    }),
    phrases: phraseList,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseConversationCheckin(value: unknown): SubmitConversationCheckinRequest | null {
  if (!isRecord(value) || !Number.isSafeInteger(value.unitId) || (value.unitId as number) < 1 || typeof value.note !== "string") return null;
  const note = value.note.trim();
  if (note.length > 280 || /[\r\n]/u.test(note)) return null;
  return { unitId: value.unitId as number, note };
}

export async function saveConversationCheckin(db: D1Database, profileId: number, input: SubmitConversationCheckinRequest, at = Date.now()): Promise<ConversationCheckin | null> {
  const unit = await db.prepare("SELECT id FROM conv_units WHERE id = ?1").bind(input.unitId).first<{ id: number }>();
  if (!unit) return null;
  await db.prepare(`
    INSERT INTO conv_checkins (profile_id, unit_id, at, note) VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT (profile_id, unit_id) DO UPDATE SET at = excluded.at, note = excluded.note
  `).bind(profileId, input.unitId, at, input.note).run();
  return { unitId: input.unitId, at, note: input.note };
}

export async function getConversationUnit(db: D1Database, unitId: number): Promise<ConversationUnitResponse | null> {
  const unitRow = await db.prepare("SELECT id, track, ord, title_ko, goal_ko FROM conv_units WHERE id = ?1").bind(unitId).first<UnitRow>();
  if (!unitRow) return null;
  const [chunkResult, sceneResult, turnResult] = await Promise.all([
    db.prepare("SELECT id, unit_id, ord, ja, kana, ko_cue, register, role, source_kind, source_ref, note_ko, audio_key FROM conv_chunks WHERE unit_id = ?1 ORDER BY ord, id").bind(unitId).all<ChunkRow>(),
    db.prepare("SELECT id, unit_id, ord, title_ko, setting_ko, goal_ko FROM conv_scenes WHERE unit_id = ?1 ORDER BY ord, id").bind(unitId).all<SceneRow>(),
    db.prepare(`
      SELECT cst.scene_id, cst.ord, cst.speaker, cst.chunk_ids, cst.variants
      FROM conv_scene_turns cst
      JOIN conv_scenes cs ON cs.id = cst.scene_id
      WHERE cs.unit_id = ?1
      ORDER BY cs.ord, cs.id, cst.ord
    `).bind(unitId).all<SceneTurnRow>(),
  ]);
  const turns = new Map<number, ConversationSceneTurn[]>();
  for (const row of turnResult.results) {
    const entries = turns.get(row.scene_id) ?? [];
    entries.push(sceneTurn(row));
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
    SELECT c.id, COALESCE((SELECT cuc.unit_id FROM conv_unit_chunks cuc WHERE cuc.chunk_id = c.id AND cuc.ord < 1000000 ORDER BY cuc.unit_id LIMIT 1), 0) AS unit_id,
      COALESCE((SELECT cuc.ord FROM conv_unit_chunks cuc WHERE cuc.chunk_id = c.id AND cuc.ord < 1000000 ORDER BY cuc.unit_id LIMIT 1), 0) AS ord,
      c.ja, c.kana, c.ko_cue, c.register, c.role, c.source_kind, c.source_ref, c.note_ko, c.audio_key,
      ccs.profile_id, ccs.chunk_id, ccs.stability, ccs.difficulty, ccs.elapsed_days, ccs.scheduled_days, ccs.learning_steps,
      ccs.reps, ccs.lapses, ccs.state, ccs.last_review, ccs.due, ccs.correct_count, ccs.total_count
    FROM conv_chunk_states ccs
    JOIN conv_chunks c ON c.id = ccs.chunk_id
    WHERE ccs.profile_id = ?1 AND ccs.due <= ?2
    ORDER BY ccs.due, ccs.chunk_id, ccs.role
  `).bind(profileId, now).all<DueRow>();
  return { chunks: result.results.map((row) => ({ ...chunk(row), ...state(row) })) };
}

export async function getConversationSession(db: D1Database, profileId: number, unitId: number, now = Date.now()): Promise<ConversationSessionResponse | null> {
  const unitRow = await db.prepare("SELECT id, track, ord, title_ko, goal_ko FROM conv_units WHERE id = ?1").bind(unitId).first<UnitRow>();
  if (!unitRow) return null;
  const [chunkResult, sceneResult, turnResult, templateResult, sceneSeen] = await Promise.all([
    db.prepare(`
      SELECT c.id, uc.unit_id, uc.ord, c.ja, c.kana, c.ko_cue, c.register, c.role, c.source_kind, c.source_ref, c.note_ko, c.audio_key,
        ccs.due
      FROM conv_unit_chunks uc
      JOIN conv_chunks c ON c.id = uc.chunk_id
      LEFT JOIN conv_chunk_states ccs ON ccs.profile_id = ?2 AND ccs.chunk_id = c.id AND ccs.role = c.role
      WHERE uc.unit_id = ?1 AND c.retired_at IS NULL
      ORDER BY uc.ord, c.id
    `).bind(unitId, profileId).all<SessionChunkRow>(),
    db.prepare("SELECT id, unit_id, ord, title_ko, setting_ko, goal_ko FROM conv_scenes WHERE unit_id = ?1 ORDER BY ord, id").bind(unitId).all<SceneRow>(),
    db.prepare(`
      SELECT cst.scene_id, cst.ord, cst.speaker, cst.chunk_ids, cst.variants
      FROM conv_scene_turns cst
      JOIN conv_scenes cs ON cs.id = cst.scene_id
      WHERE cs.unit_id = ?1
      ORDER BY cs.ord, cs.id, cst.ord
    `).bind(unitId).all<SceneTurnRow>(),
    db.prepare(`
      SELECT t.id, t.key, t.unit_id, t.ord, t.ja_template, t.kana_template, t.cue_ko, t.register, t.pattern_chunk_id, t.slots, cts.due
      FROM conv_templates t
      LEFT JOIN conv_template_states cts ON cts.profile_id = ?2 AND cts.template_id = t.id
      WHERE t.unit_id = ?1 AND t.pattern_chunk_id IS NOT NULL
      ORDER BY t.ord, t.id
    `).bind(unitId, profileId).all<TemplateRow>(),
    db.prepare(`
      SELECT a.scene_id, MAX(a.answered_at) AS last_at
      FROM conv_attempts a JOIN conv_scenes s ON s.id = a.scene_id
      WHERE a.profile_id = ?2 AND s.unit_id = ?1
      GROUP BY a.scene_id
    `).bind(unitId, profileId).all<{ scene_id: number; last_at: number }>(),
  ]);
  const turns = new Map<number, ConversationSceneTurn[]>();
  for (const row of turnResult.results) {
    const entries = turns.get(row.scene_id) ?? [];
    entries.push(sceneTurn(row));
    turns.set(row.scene_id, entries);
  }
  const scenes = sceneResult.results.map((row) => ({ ...scene(row), turns: turns.get(row.id) ?? [] }));
  // Unseen scenes first, then the one practiced longest ago; ties keep authored order.
  const lastPracticed = new Map(sceneSeen.results.map((row) => [row.scene_id, row.last_at]));
  const practiceScene = [...scenes].sort((left, right) => (lastPracticed.get(left.id) ?? -1) - (lastPracticed.get(right.id) ?? -1) || left.ord - right.ord)[0];
  if (!practiceScene) return null;
  const chunks = chunkResult.results.map(chunk);
  const dueChunks = chunkResult.results.filter((row) => row.due !== null && row.due <= now).map(chunk);
  const newChunks = chunkResult.results.filter((row) => row.due === null).map(chunk);
  const items = composeTalkSession({
    dueChunks,
    newChunks,
    practiceScene,
    completedUnits: [{ chunks, scene: practiceScene }],
  });
  // Slot drills (new or due) sit just before the closing scene.
  const drills = templateResult.results.filter((row) => row.due === null || row.due <= now).map((row) => ({ kind: "drill" as const, template: template(row) }));
  const withDrills: ConversationSessionItem[] = [...items.slice(0, -1), ...drills, ...items.slice(-1)];
  return { unit: unit(unitRow), chunks, items: withDrills };
}
