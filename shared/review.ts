import type { SubmitReviewRequest } from "./api";
import { TRACKS, type Track } from "./types";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function validIsoTimestamp(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  const offsetMinutes = match[8] === "Z" ? 0 : (match[9] === "+" ? 1 : -1) * (Number(match[10]) * 60 + Number(match[11]));
  const local = new Date(parsed + offsetMinutes * 60_000);
  const milliseconds = Number((match[7] ?? "").padEnd(3, "0"));
  return local.getUTCFullYear() === Number(match[1])
    && local.getUTCMonth() + 1 === Number(match[2])
    && local.getUTCDate() === Number(match[3])
    && local.getUTCHours() === Number(match[4])
    && local.getUTCMinutes() === Number(match[5])
    && local.getUTCSeconds() === Number(match[6])
    && local.getUTCMilliseconds() === milliseconds;
}

export function parseReviewRequest(value: unknown): SubmitReviewRequest | null {
  const body = record(value);
  if (!body) return null;
  if (typeof body.sessionId !== "string" || body.sessionId.length < 1 || body.sessionId.length > 128) return null;
  if (!Number.isInteger(body.cardIndex) || (body.cardIndex as number) < 0 || (body.cardIndex as number) > 10_000) return null;
  if (typeof body.characterKey !== "string" || body.characterKey.length < 1 || body.characterKey.length > 16) return null;
  if (body.wordId !== undefined && (!Number.isSafeInteger(body.wordId) || (body.wordId as number) < 1)) return null;
  if (typeof body.track !== "string" || !TRACKS.includes(body.track as Track)) return null;
  if (typeof body.correct !== "boolean") return null;
  if (typeof body.skipped !== "boolean" || body.skipped && body.correct) return null;
  if (!Number.isInteger(body.elapsedMs) || (body.elapsedMs as number) < 0 || (body.elapsedMs as number) > 3_600_000) return null;
  if (body.mode !== "lesson" && body.mode !== "review" && body.mode !== "level-review" && body.mode !== "placement") return null;
  if (body.wordId !== undefined && body.mode === "placement") return null;
  if (body.answeredAt !== undefined && !validIsoTimestamp(body.answeredAt)) return null;
  return body as SubmitReviewRequest;
}
