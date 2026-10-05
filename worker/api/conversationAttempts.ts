/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-unsafe-dictionary-type -- Network payload parser validates each field before conversion to its typed attempt contract. */
import { initialState, schedule, type Grade, type ReviewState } from "../../shared/fsrs";
import type { ConversationGrade, SubmitConversationAttemptRequest, SubmitConversationAttemptResponse } from "../../shared/api";
import { CONVERSATION_ROLES, type ConversationRole } from "../../shared/types";

const MAX_FUTURE_ANSWER_MS = 5 * 60_000;

type AttemptRow = { id: number };
type StateRow = {
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: ReviewState["state"];
  last_review: number | null;
  due: number;
  correct_count: number;
  total_count: number;
};

export class ConversationTargetNotFound extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseConversationAttempt(value: unknown, now = Date.now()): SubmitConversationAttemptRequest | null {
  if (!isRecord(value)) return null;
  if (typeof value.clientAttemptId !== "string" || value.clientAttemptId.length < 1 || value.clientAttemptId.length > 128) return null;
  if (!Number.isSafeInteger(value.chunkId) || (value.chunkId as number) < 1) return null;
  if (value.sceneId !== undefined && value.sceneId !== null && (!Number.isSafeInteger(value.sceneId) || (value.sceneId as number) < 1)) return null;
  if (!CONVERSATION_ROLES.includes(value.role as ConversationRole)) return null;
  if (value.grade !== "again" && value.grade !== "hard" && value.grade !== "good" && value.grade !== "easy") return null;
  if (!Number.isSafeInteger(value.answeredAt) || (value.answeredAt as number) < 0 || (value.answeredAt as number) > now + MAX_FUTURE_ANSWER_MS) return null;
  if (value.latencyMs !== undefined && value.latencyMs !== null && (!Number.isSafeInteger(value.latencyMs) || (value.latencyMs as number) < 0)) return null;
  if (value.hints !== undefined && (!Number.isSafeInteger(value.hints) || (value.hints as number) < 0)) return null;
  if (value.replays !== undefined && (!Number.isSafeInteger(value.replays) || (value.replays as number) < 0)) return null;
  if (value.loop !== undefined && !["echo", "shadow", "drill", "roleplay", "free"].includes(value.loop as string)) return null;
  if (value.input !== undefined && !["voice", "tap", "keyboard"].includes(value.input as string)) return null;
  return value as SubmitConversationAttemptRequest;
}

function cappedGrade(input: SubmitConversationAttemptRequest): ConversationGrade {
  if (input.role === "hear") {
    if (input.grade === "again") return "again";
    return (input.replays ?? 0) >= 2 ? "hard" : input.grade === "easy" ? "good" : input.grade;
  }
  if ((input.hints ?? 0) >= 2) return input.grade === "again" ? "again" : "hard";
  if ((input.hints ?? 0) > 0 || (input.replays ?? 0) >= 3) return input.grade === "easy" ? "good" : input.grade;
  return input.grade;
}

function gradeValue(grade: ConversationGrade): number {
  return ({ again: 1, hard: 2, good: 3, easy: 4 })[grade];
}

function toState(row: StateRow): ReviewState {
  return {
    stability: row.stability,
    difficulty: row.difficulty,
    elapsedDays: row.elapsed_days,
    scheduledDays: row.scheduled_days,
    learningSteps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    lastReview: row.last_review === null ? null : new Date(row.last_review),
    due: new Date(row.due),
    correctCount: row.correct_count,
    totalCount: row.total_count,
  };
}

function prepareUpsertState(
  db: D1Database,
  profileId: number,
  input: SubmitConversationAttemptRequest,
  state: ReviewState,
  expectedReps: number,
): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO conv_chunk_states (
      profile_id, chunk_id, role, stability, difficulty, elapsed_days, scheduled_days,
      learning_steps, reps, lapses, state, last_review, due, correct_count, total_count
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
    ON CONFLICT (profile_id, chunk_id, role) DO UPDATE SET
      stability = excluded.stability, difficulty = excluded.difficulty,
      elapsed_days = excluded.elapsed_days, scheduled_days = excluded.scheduled_days,
      learning_steps = excluded.learning_steps, reps = excluded.reps, lapses = excluded.lapses,
      state = excluded.state, last_review = excluded.last_review, due = excluded.due,
      correct_count = excluded.correct_count, total_count = excluded.total_count
    WHERE conv_chunk_states.reps = ?16
  `).bind(profileId, input.chunkId, input.role, state.stability, state.difficulty, state.elapsedDays,
    state.scheduledDays, state.learningSteps, state.reps, state.lapses, state.state,
    state.lastReview?.getTime() ?? null, state.due.getTime(), state.correctCount, state.totalCount, expectedReps);
}

function prepareAttempt(
  db: D1Database,
  profileId: number,
  input: SubmitConversationAttemptRequest,
  grade: ConversationGrade,
  eventTime: Date,
): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO conv_attempts (profile_id, client_attempt_id, chunk_id, scene_id, role, grade, answered_at, latency_ms, loop, input, hints, replays)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
  `).bind(profileId, input.clientAttemptId, input.chunkId, input.sceneId ?? null, input.role, gradeValue(grade), eventTime.getTime(), input.latencyMs ?? null, input.loop ?? "unknown", input.input ?? "unknown", input.hints ?? 0, input.replays ?? 0);
}

async function existingAttempt(db: D1Database, profileId: number, input: SubmitConversationAttemptRequest): Promise<AttemptRow | null> {
  return db.prepare("SELECT id FROM conv_attempts WHERE profile_id = ?1 AND client_attempt_id = ?2")
    .bind(profileId, input.clientAttemptId).first<AttemptRow>();
}

export async function submitConversationAttempt(
  db: D1Database,
  profileId: number,
  input: SubmitConversationAttemptRequest,
  now = new Date(),
): Promise<SubmitConversationAttemptResponse> {
  const grade = cappedGrade(input);
  const existing = await existingAttempt(db, profileId, input);
  if (existing) return { grade };

  const target = await db.prepare(`
    SELECT c.id FROM conv_chunks c
    LEFT JOIN conv_scenes s ON s.id = ?3
    WHERE c.id = ?1 AND c.role = ?2 AND (?3 IS NULL OR s.unit_id = c.unit_id)
  `).bind(input.chunkId, input.role, input.sceneId ?? null).first<AttemptRow>();
  if (!target) throw new ConversationTargetNotFound();

  const row = await db.prepare(`
    SELECT stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses,
      state, last_review, due, correct_count, total_count
    FROM conv_chunk_states WHERE profile_id = ?1 AND chunk_id = ?2 AND role = ?3
  `).bind(profileId, input.chunkId, input.role).first<StateRow>();
  const eventTime = new Date(Math.min(input.answeredAt, now.getTime()));
  if (input.loop === "roleplay") {
    const statements = [prepareAttempt(db, profileId, input, grade, eventTime)];
    if (grade === "again") statements.push(db.prepare(`
      UPDATE conv_chunk_states SET due = MIN(due, ?4) WHERE profile_id = ?1 AND chunk_id = ?2 AND role = ?3
    `).bind(profileId, input.chunkId, input.role, eventTime.getTime()));
    try {
      await db.batch(statements);
    } catch (error) {
      if (await existingAttempt(db, profileId, input)) return { grade };
      throw error;
    }
    return { grade };
  }
  const state = row ? toState(row) : initialState(eventTime);
  const scheduled = schedule(state, grade as Grade, new Date(Math.max(eventTime.getTime(), state.lastReview?.getTime() ?? eventTime.getTime())));
  const stateWrite = prepareUpsertState(db, profileId, input, scheduled.next, state.reps);
  let result: D1Result<unknown>[];
  try {
    result = await db.batch([prepareAttempt(db, profileId, input, grade, eventTime), stateWrite]);
  } catch (error) {
    if (await existingAttempt(db, profileId, input)) return { grade };
    throw error;
  }
  if (result[1].meta.changes !== 1) {
    const current = await db.prepare(`
      SELECT stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses,
        state, last_review, due, correct_count, total_count
      FROM conv_chunk_states WHERE profile_id = ?1 AND chunk_id = ?2 AND role = ?3
    `).bind(profileId, input.chunkId, input.role).first<StateRow>();
    if (current) {
      const retried = toState(current);
      const rescheduled = schedule(retried, grade as Grade, new Date(Math.max(eventTime.getTime(), retried.lastReview?.getTime() ?? eventTime.getTime())));
      await db.batch([prepareUpsertState(db, profileId, input, rescheduled.next, retried.reps)]);
    }
  }
  return { grade };
}

export async function submitConversationAttemptBatch(
  db: D1Database,
  profileId: number,
  inputs: SubmitConversationAttemptRequest[],
  now = new Date(),
): Promise<SubmitConversationAttemptResponse[]> {
  const results: SubmitConversationAttemptResponse[] = [];
  for (const input of inputs) results.push(await submitConversationAttempt(db, profileId, input, now));
  return results;
}
