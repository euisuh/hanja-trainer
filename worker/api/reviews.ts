import { gradeFromReview, initialState, schedule } from "../../src/shared/fsrs";
import type { DueReviewsResponse, SubmitReviewRequest, SubmitReviewResponse } from "../../src/shared/api";
import { TRACKS, type Track } from "../../src/shared/types";
import { getState, prepareAppendLog, prepareUpsertState } from "../db/reviews";

const DAY_MS = 86_400_000;

type CharacterRow = { id: number; key: string; position?: number };
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

export { parseReviewRequest } from "../../src/shared/review";

export function parseDueRequest(search: URLSearchParams): { tracks: Track[]; limit: number } | null {
  const tracks = [...new Set((search.get("tracks") ?? "").split(",").filter(Boolean))];
  const rawLimit = search.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (tracks.length === 0 || !tracks.every((track) => TRACKS.includes(track as Track))) return null;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return null;
  return { tracks: tracks as Track[], limit };
}

async function existingSubmission(db: D1Database, profileId: number, input: Pick<SubmitReviewRequest, "sessionId" | "cardIndex">): Promise<SubmitReviewResponse | null> {
  const row = await db.prepare("SELECT response_json FROM review_submissions WHERE profile_id = ?1 AND session_id = ?2 AND card_index = ?3")
    .bind(profileId, input.sessionId, input.cardIndex).first<SubmissionRow>();
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

export async function submitReview(db: D1Database, profileId: number, input: SubmitReviewRequest, now = new Date()): Promise<SubmitReviewResponse> {
  const existing = await existingSubmission(db, profileId, input);
  if (existing) return existing;
  const result = input.wordId === undefined
    ? await db.prepare(`
        SELECT c.id, c.key
        FROM characters c
        JOIN character_tracks ct ON ct.character_id = c.id
        WHERE c.key = ?1 AND ct.track = ?2
      `).bind(input.characterKey, input.track).all<CharacterRow>()
    : await db.prepare(`
        SELECT c.id, c.key, wm.position
        FROM words w
        JOIN word_members wm ON wm.word_id = w.id
        JOIN characters c ON c.id = wm.character_id
        JOIN character_tracks ct ON ct.character_id = c.id AND ct.track = w.track
        JOIN review_states rs ON rs.profile_id = ?3 AND rs.character_id = c.id AND rs.track = w.track
        WHERE w.id = ?1 AND w.track = ?2
        ORDER BY wm.position
      `).bind(input.wordId, input.track, profileId).all<CharacterRow>();
  const characters = result.results;
  if (input.wordId === undefined) {
    if (characters.length !== 1) throw new ReviewTargetNotFound();
  } else if (characters.length !== 2 || characters[0].key !== input.characterKey || characters.some((character, index) => character.position !== index)) {
    throw new ReviewTargetNotFound();
  }

  const grade = gradeFromReview(input.correct, input.skipped, input.elapsedMs);
  const scheduled = await Promise.all(characters.map(async (character) => schedule(
    input.mode === "placement" ? initialState(now) : await getState(db, profileId, character.id, input.track) ?? initialState(now),
    grade,
    now,
  )));
  const primary = scheduled[0];
  const response = input.mode === "placement"
    ? responseFor(now, 0, 0, 0)
    : responseFor(primary.next.due, primary.next.scheduledDays, primary.next.stability, primary.next.difficulty);
  const statements = [
    ...characters.flatMap((character, index) => [
      ...(input.mode === "placement" ? [] : [prepareUpsertState(db, profileId, character.id, input.track, scheduled[index].next)]),
      prepareAppendLog(db, profileId, {
        ...scheduled[index].log,
        characterId: character.id,
        track: input.track,
        correct: input.correct,
        skipped: input.skipped,
        elapsedMs: input.elapsedMs,
        mode: input.mode,
        sessionId: input.sessionId,
        cardIndex: input.cardIndex,
      }),
    ]),
    db.prepare("INSERT INTO review_submissions (profile_id, session_id, card_index, response_json) VALUES (?1, ?2, ?3, ?4)")
      .bind(profileId, input.sessionId, input.cardIndex, JSON.stringify(response)),
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    const duplicate = await existingSubmission(db, profileId, input);
    if (duplicate) return duplicate;
    throw error;
  }
  return response;
}

export async function submitReviewBatch(db: D1Database, profileId: number, inputs: SubmitReviewRequest[], now = new Date()): Promise<SubmitReviewResponse[]> {
  const responses: SubmitReviewResponse[] = [];
  for (const input of inputs) responses.push(await submitReview(db, profileId, input, now));
  return responses;
}

export async function getDueReviews(db: D1Database, profileId: number, tracks: Track[], limit: number, now = new Date()): Promise<DueReviewsResponse> {
  const placeholders = tracks.map((_, index) => `?${index + 2}`).join(", ");
  const dueParameter = tracks.length + 2;
  const [countResult, cardsResult] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS total FROM review_states WHERE profile_id = ?1 AND track IN (${placeholders}) AND due <= ?${dueParameter}`)
      .bind(profileId, ...tracks, now.getTime()),
    db.prepare(`
      SELECT c.key, rs.track, ct.glyph,
        CASE rs.track WHEN 'kr' THEN ct.kr_reading WHEN 'jp' THEN ct.jp_on ELSE ct.cn_pinyin END AS reading,
        rs.due, rs.stability
      FROM review_states rs
      JOIN characters c ON c.id = rs.character_id
      JOIN character_tracks ct ON ct.character_id = rs.character_id AND ct.track = rs.track
      WHERE rs.profile_id = ?1 AND rs.track IN (${placeholders}) AND rs.due <= ?${dueParameter}
      ORDER BY rs.due, rs.character_id
      LIMIT ?${tracks.length + 3}
    `).bind(profileId, ...tracks, now.getTime(), limit),
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
