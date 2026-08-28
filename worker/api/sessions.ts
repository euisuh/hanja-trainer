import type { CreateSessionRequest, ProfileResponse } from "../../src/shared/api";
import { TRACKS } from "../../src/shared/types";

const DAY_MS = 86_400_000;
type NumberRow = { value: number | null };
type DayRow = { day: string };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parseSessionRequest(value: unknown): CreateSessionRequest | null {
  const body = record(value);
  if (!body || (body.mode !== "lesson" && body.mode !== "review" && body.mode !== "placement")) return null;
  if (typeof body.startedAt !== "string" || typeof body.endedAt !== "string") return null;
  const started = Date.parse(body.startedAt);
  const ended = Date.parse(body.endedAt);
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) return null;
  for (const field of ["answered", "correct", "bestCombo", "xp"] as const) {
    if (!Number.isInteger(body[field]) || (body[field] as number) < 0) return null;
  }
  if ((body.answered as number) > 10_000 || (body.correct as number) > (body.answered as number) || (body.bestCombo as number) > (body.answered as number) || (body.xp as number) > 1_000_000) return null;
  return body as CreateSessionRequest;
}

function utcDay(date: Date): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY_MS);
}

export function streaks(days: string[], now: Date): { streak: number; longestStreak: number } {
  const active = [...new Set(days.map((day) => Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS)))].filter(Number.isFinite).sort((a, b) => a - b);
  let longestStreak = 0;
  let run = 0;
  let previous: number | undefined;
  for (const day of active) {
    run = previous !== undefined && day === previous + 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    previous = day;
  }
  const set = new Set(active);
  const today = utcDay(now);
  let cursor = set.has(today) ? today : today - 1;
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }
  return { streak, longestStreak };
}

export async function getProfile(db: D1Database, now = new Date()): Promise<ProfileResponse> {
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const [xpResult, todayResult, daysResult] = await db.batch([
    db.prepare("SELECT COALESCE(SUM(xp), 0) AS value FROM sessions"),
    db.prepare("SELECT COALESCE(SUM(xp), 0) AS value FROM sessions WHERE ended_at >= ?1 AND ended_at < ?2").bind(dayStart, dayStart + DAY_MS),
    db.prepare("SELECT DISTINCT strftime('%Y-%m-%d', ended_at / 1000, 'unixepoch') AS day FROM sessions ORDER BY day"),
  ]);
  const xp = Number((xpResult.results[0] as unknown as NumberRow | undefined)?.value ?? 0);
  const todayXp = Number((todayResult.results[0] as unknown as NumberRow | undefined)?.value ?? 0);
  const days = (daysResult.results as unknown as DayRow[]).map((row) => row.day);
  return { xp, todayXp, goal: 40, ...streaks(days, now), enabledTracks: [...TRACKS] };
}

export async function createSession(db: D1Database, input: CreateSessionRequest, now = new Date()): Promise<ProfileResponse> {
  await db.prepare(`
    INSERT INTO sessions (mode, started_at, ended_at, answered, correct, best_combo, xp)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
  `).bind(input.mode, Date.parse(input.startedAt), Date.parse(input.endedAt), input.answered, input.correct, input.bestCombo, input.xp).run();
  return getProfile(db, now);
}
