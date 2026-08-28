import { Rating } from "ts-fsrs";
import type { Track } from "../../src/shared/types";
import type { Grade, ReviewLogEntry, ReviewState } from "../../src/shared/fsrs";

export type ReviewMode = "lesson" | "review" | "placement";

export interface StoredReviewState extends ReviewState {
  characterId: number;
  track: Track;
}

export interface StoredReviewLog extends ReviewLogEntry {
  characterId: number;
  track: Track;
  correct: boolean;
  elapsedMs: number;
  mode: ReviewMode;
}

export interface CharacterReviewStats {
  states: StoredReviewState[];
  correct: number;
  total: number;
  accuracy: number;
  intervals: number[];
}

interface StateRow {
  character_id: number;
  track: Track;
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
}

interface LogRow {
  scheduled_days_after: number;
}

const SELECT_STATE = `
  SELECT character_id, track, stability, difficulty, elapsed_days, scheduled_days,
    learning_steps, reps, lapses, state, last_review, due, correct_count, total_count
  FROM review_states
`;

const ratingValues: Record<Grade, Rating> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

function hydrate(row: StateRow): StoredReviewState {
  return {
    characterId: row.character_id,
    track: row.track,
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

export async function getState(
  db: D1Database,
  characterId: number,
  track: Track,
): Promise<ReviewState | null> {
  const row = await db
    .prepare(`${SELECT_STATE} WHERE character_id = ?1 AND track = ?2`)
    .bind(characterId, track)
    .first<StateRow>();
  return row ? hydrate(row) : null;
}

export async function upsertState(
  db: D1Database,
  characterId: number,
  track: Track,
  state: ReviewState,
): Promise<void> {
  await db.prepare(`
    INSERT INTO review_states (
      character_id, track, stability, difficulty, elapsed_days, scheduled_days,
      learning_steps, reps, lapses, state, last_review, due, correct_count, total_count
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
    ON CONFLICT (character_id, track) DO UPDATE SET
      stability = excluded.stability,
      difficulty = excluded.difficulty,
      elapsed_days = excluded.elapsed_days,
      scheduled_days = excluded.scheduled_days,
      learning_steps = excluded.learning_steps,
      reps = excluded.reps,
      lapses = excluded.lapses,
      state = excluded.state,
      last_review = excluded.last_review,
      due = excluded.due,
      correct_count = excluded.correct_count,
      total_count = excluded.total_count
  `).bind(
    characterId,
    track,
    state.stability,
    state.difficulty,
    state.elapsedDays,
    state.scheduledDays,
    state.learningSteps,
    state.reps,
    state.lapses,
    state.state,
    state.lastReview?.getTime() ?? null,
    state.due.getTime(),
    state.correctCount,
    state.totalCount,
  ).run();
}

export async function appendLog(db: D1Database, log: StoredReviewLog): Promise<void> {
  await db.prepare(`
    INSERT INTO review_log (
      character_id, track, rating, answered_at, correct, elapsed_ms,
      scheduled_days_before, scheduled_days_after, mode
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
  `).bind(
    log.characterId,
    log.track,
    ratingValues[log.rating],
    log.answeredAt.getTime(),
    Number(log.correct),
    log.elapsedMs,
    log.scheduledDaysBefore,
    log.scheduledDaysAfter,
    log.mode,
  ).run();
}

export async function getDueQueue(
  db: D1Database,
  tracks: Track[],
  limit: number,
  now: Date,
): Promise<StoredReviewState[]> {
  if (tracks.length === 0 || limit <= 0) return [];

  const placeholders = tracks.map((_, index) => `?${index + 1}`).join(", ");
  const result = await db.prepare(`
    ${SELECT_STATE}
    WHERE track IN (${placeholders}) AND due <= ?${tracks.length + 1}
    ORDER BY due ASC
    LIMIT ?${tracks.length + 2}
  `).bind(...tracks, now.getTime(), Math.floor(limit)).all<StateRow>();
  return result.results.map(hydrate);
}

export async function getStatsForCharacter(
  db: D1Database,
  characterId: number,
): Promise<CharacterReviewStats> {
  const [statesResult, logsResult] = await Promise.all([
    db.prepare(`${SELECT_STATE} WHERE character_id = ?1 ORDER BY track`).bind(characterId).all<StateRow>(),
    db.prepare(`
      SELECT scheduled_days_after
      FROM review_log
      WHERE character_id = ?1
      ORDER BY answered_at, id
    `).bind(characterId).all<LogRow>(),
  ]);
  const states = statesResult.results.map(hydrate);
  const correct = states.reduce((sum, state) => sum + state.correctCount, 0);
  const total = states.reduce((sum, state) => sum + state.totalCount, 0);
  return {
    states,
    correct,
    total,
    accuracy: total === 0 ? 0 : correct / total,
    intervals: logsResult.results.map((row) => row.scheduled_days_after),
  };
}
