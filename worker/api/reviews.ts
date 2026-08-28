import { gradeFromAnswer, initialState, schedule } from "../../src/shared/fsrs";
import type { DueReviewsResponse, SubmitReviewRequest, SubmitReviewResponse } from "../../src/shared/api";
import { TRACKS, type Track } from "../../src/shared/types";
import { getState, prepareAppendLog, prepareUpsertState } from "../db/reviews";

const DAY_MS = 86_400_000;

type CharacterRow = { id: number };
type SubmissionRow = { response_json: string };
type DueRow = {
  total?: number;
  key: string;
  track: Track;
  glyph: string;
  reading: string;
  due: number;
  stability: number;
};

export class ReviewTargetNotFound extends Error {}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parseReviewRequest(value: unknown): SubmitReviewRequest | null {
  const body = record(value);
  if (!body) return null;
  if (typeof body.sessionId !== "string" || body.sessionId.length < 1 || body.sessionId.length > 128) return null;
  if (!Number.isInteger(body.cardIndex) || (body.cardIndex as number) < 0 || (body.cardIndex as number) > 10_000) return null;
  if (typeof body.characterKey !== "string" || body.characterKey.length < 1 || body.characterKey.length > 16) return null;
  if (typeof body.track !== "string" || !TRACKS.includes(body.track as Track)) return null;
  if (typeof body.correct !== "boolean") return null;
  if (!Number.isInteger(body.elapsedMs) || (body.elapsedMs as number) < 0 || (body.elapsedMs as number) > 3_600_000) return null;
  if (body.mode !== "lesson" && body.mode !== "review" && body.mode !== "placement") return null;
  return body as SubmitReviewRequest;
}

export function parseDueRequest(search: URLSearchParams): { tracks: Track[]; limit: number } | null {
  const tracks = [...new Set((search.get("tracks") ?? "").split(",").filter(Boolean))];
  const rawLimit = search.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (tracks.length === 0 || !tracks.every((track) => TRACKS.includes(track as Track))) return null;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return null;
  return { tracks: tracks as Track[], limit };
}

async function existingSubmission(db: D1Database, input: Pick<SubmitReviewRequest, "sessionId" | "cardIndex">): Promise<SubmitReviewResponse | null> {
  const row = await db.prepare("SELECT response_json FROM review_submissions WHERE session_id = ?1 AND card_index = ?2")
    .bind(input.sessionId, input.cardIndex).first<SubmissionRow>();
  return row ? JSON.parse(row.response_json) as SubmitReviewResponse : null;
}

function responseFor(due: Date, scheduledDays: number, stability: number, difficulty: number): SubmitReviewResponse {
  return {
    due: due.toISOString(),
    scheduledDays,
    stability,
    difficulty,
    dueLabel: scheduledDays <= 0 ? "곧" : `${scheduledDays}일 후`,
  };
}

export async function submitReview(db: D1Database, input: SubmitReviewRequest, now = new Date()): Promise<SubmitReviewResponse> {
  const existing = await existingSubmission(db, input);
  if (existing) return existing;
  const character = await db.prepare(`
    SELECT c.id
    FROM characters c
    JOIN character_tracks ct ON ct.character_id = c.id
    WHERE c.key = ?1 AND ct.track = ?2
  `).bind(input.characterKey, input.track).first<CharacterRow>();
  if (!character) throw new ReviewTargetNotFound();

  const grade = gradeFromAnswer(input.correct, input.elapsedMs);
  const previous = input.mode === "placement" ? initialState(now) : await getState(db, character.id, input.track) ?? initialState(now);
  const scheduled = schedule(previous, grade, now);
  const response = input.mode === "placement"
    ? responseFor(now, 0, 0, 0)
    : responseFor(scheduled.next.due, scheduled.next.scheduledDays, scheduled.next.stability, scheduled.next.difficulty);
  const statements = [
    ...(input.mode === "placement" ? [] : [prepareUpsertState(db, character.id, input.track, scheduled.next)]),
    prepareAppendLog(db, {
      ...scheduled.log,
      characterId: character.id,
      track: input.track,
      correct: input.correct,
      elapsedMs: input.elapsedMs,
      mode: input.mode,
      sessionId: input.sessionId,
      cardIndex: input.cardIndex,
    }),
    db.prepare("INSERT INTO review_submissions (session_id, card_index, response_json) VALUES (?1, ?2, ?3)")
      .bind(input.sessionId, input.cardIndex, JSON.stringify(response)),
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    const duplicate = await existingSubmission(db, input);
    if (duplicate) return duplicate;
    throw error;
  }
  return response;
}

export async function submitReviewBatch(db: D1Database, inputs: SubmitReviewRequest[], now = new Date()): Promise<SubmitReviewResponse[]> {
  const responses: SubmitReviewResponse[] = [];
  for (const input of inputs) responses.push(await submitReview(db, input, now));
  return responses;
}

export async function getDueReviews(db: D1Database, tracks: Track[], limit: number, now = new Date()): Promise<DueReviewsResponse> {
  const placeholders = tracks.map((_, index) => `?${index + 1}`).join(", ");
  const dueParameter = tracks.length + 1;
  const [countResult, cardsResult] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS total FROM review_states WHERE track IN (${placeholders}) AND due <= ?${dueParameter}`)
      .bind(...tracks, now.getTime()),
    db.prepare(`
      SELECT c.key, rs.track, ct.glyph,
        CASE rs.track WHEN 'kr' THEN ct.kr_reading WHEN 'jp' THEN ct.jp_on ELSE ct.cn_pinyin END AS reading,
        rs.due, rs.stability
      FROM review_states rs
      JOIN characters c ON c.id = rs.character_id
      JOIN character_tracks ct ON ct.character_id = rs.character_id AND ct.track = rs.track
      WHERE rs.track IN (${placeholders}) AND rs.due <= ?${dueParameter}
      ORDER BY rs.due, rs.character_id
      LIMIT ?${tracks.length + 2}
    `).bind(...tracks, now.getTime(), limit),
  ]);
  const total = Number((countResult.results[0] as unknown as { total: number } | undefined)?.total ?? 0);
  const cards = (cardsResult.results as unknown as DueRow[]).map((row) => ({
    characterKey: row.key,
    track: row.track,
    glyph: row.glyph,
    reading: row.reading,
    dueAt: new Date(row.due).toISOString(),
    overdueDays: Math.max(0, Math.floor((now.getTime() - row.due) / DAY_MS)),
    stability: row.stability,
  }));
  return { total, cards };
}
