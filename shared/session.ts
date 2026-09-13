import type { CreateSessionRequest } from "./api";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parseSessionRequest(value: unknown): CreateSessionRequest | null {
  const body = record(value);
  if (!body || (body.mode !== "lesson" && body.mode !== "review" && body.mode !== "level-review" && body.mode !== "placement")) return null;
  if (body.sessionId !== undefined && (typeof body.sessionId !== "string" || body.sessionId.length < 1 || body.sessionId.length > 128)) return null;
  if (typeof body.startedAt !== "string" || typeof body.endedAt !== "string") return null;
  const started = Date.parse(body.startedAt);
  const ended = Date.parse(body.endedAt);
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) return null;
  for (const field of ["answered", "correct", "skipped", "bestCombo", "xp"] as const) {
    if (!Number.isInteger(body[field]) || (body[field] as number) < 0) return null;
  }
  if ((body.answered as number) > 10_000 || (body.correct as number) + (body.skipped as number) > (body.answered as number) || (body.bestCombo as number) > (body.answered as number) || (body.xp as number) > 1_000_000) return null;
  return body as CreateSessionRequest;
}
