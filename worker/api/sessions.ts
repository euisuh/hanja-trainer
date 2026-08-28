import type { CreateSessionRequest, ProfileResponse } from "../../src/shared/api";
import { TRACKS } from "../../src/shared/types";

const DAY_MS = 86_400_000;
type ProfileRow = { enabled_tracks: string; daily_goal: number; timezone: string; xp: number };
type SessionRow = { ended_at: number; xp: number };
type LogRow = { answered_at: number };

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

export function zonedDayKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export async function getProfile(db: D1Database, now = new Date()): Promise<ProfileResponse> {
  const [profileResult, sessionsResult, logsResult] = await db.batch([
    db.prepare("SELECT enabled_tracks, daily_goal, timezone, xp FROM profile WHERE id = 1"),
    db.prepare("SELECT ended_at, xp FROM sessions"),
    db.prepare("SELECT answered_at FROM review_log"),
  ]);
  const profile = profileResult.results[0] as unknown as ProfileRow | undefined;
  if (!profile) throw new Error("Profile row is missing");
  const parsed = JSON.parse(profile.enabled_tracks) as unknown;
  const enabledTracks = Array.isArray(parsed) ? TRACKS.filter((track) => parsed.includes(track)) : [...TRACKS];
  const today = zonedDayKey(now, profile.timezone);
  const todayXp = (sessionsResult.results as unknown as SessionRow[]).filter((row) => zonedDayKey(new Date(row.ended_at), profile.timezone) === today).reduce((sum, row) => sum + row.xp, 0);
  const days = [
    ...(sessionsResult.results as unknown as SessionRow[]).map((row) => zonedDayKey(new Date(row.ended_at), profile.timezone)),
    ...(logsResult.results as unknown as LogRow[]).map((row) => zonedDayKey(new Date(row.answered_at), profile.timezone)),
  ];
  return { xp: profile.xp, todayXp, goal: profile.daily_goal, ...streaks(days, new Date(`${today}T12:00:00Z`)), enabledTracks };
}

export async function createSession(db: D1Database, input: CreateSessionRequest, now = new Date()): Promise<ProfileResponse> {
  await db.batch([
    db.prepare(`
      INSERT INTO sessions (mode, started_at, ended_at, answered, correct, best_combo, xp)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    `).bind(input.mode, Date.parse(input.startedAt), Date.parse(input.endedAt), input.answered, input.correct, input.bestCombo, input.xp),
    db.prepare("UPDATE profile SET xp = xp + ?1, updated_at = ?2 WHERE id = 1").bind(input.xp, now.getTime()),
  ]);
  return getProfile(db, now);
}
