/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type -- D1 query rows cross an untyped platform boundary; local guards validate each selected column before metric calculation. */
import type { ConversationStatsResponse } from "../../shared/api";
import { zonedDayKey } from "./sessions";

const CALENDAR_DAYS = 126;
const DAY_MS = 86_400_000;
type ProfileRow = { timezone: string };
type AttemptRow = { id: number; chunk_id: number; scene_id: number | null; grade: number; answered_at: number; latency_ms: number | null; hints: number; replays: number; loop: string; input: string };
type RetentionRow = { retained: number | null; total: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProfileRow(value: unknown): value is ProfileRow {
  return isRecord(value) && typeof value.timezone === "string";
}

function isRetentionRow(value: unknown): value is RetentionRow {
  return isRecord(value) && Number.isSafeInteger(value.total) && (value.retained === null || Number.isSafeInteger(value.retained));
}

function isAttemptRow(value: unknown): value is AttemptRow {
  return isRecord(value)
    && ["id", "chunk_id", "grade", "answered_at", "hints", "replays"].every((key) => Number.isSafeInteger(value[key]))
    && (value.scene_id === null || Number.isSafeInteger(value.scene_id))
    && (value.latency_ms === null || Number.isSafeInteger(value.latency_ms))
    && typeof value.loop === "string" && typeof value.input === "string";
}

function addDays(key: string, amount: number): string {
  const date = new Date(`${key}T00:00:00Z`);
  return new Date(date.getTime() + amount * DAY_MS).toISOString().slice(0, 10);
}

function rate(successes: number, total: number): number | null {
  return total === 0 ? null : successes / total;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export async function getConversationStats(db: D1Database, profileId: number, now = new Date()): Promise<ConversationStatsResponse> {
  const [profileResult, retentionResult, attemptsResult] = await db.batch([
    db.prepare("SELECT timezone FROM profile WHERE id = ?1").bind(profileId),
    db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN stability >= 21 AND state = 2 THEN 1 ELSE 0 END) AS retained FROM conv_chunk_states WHERE profile_id = ?1 AND role = 'say'").bind(profileId),
    db.prepare("SELECT id, chunk_id, scene_id, grade, answered_at, latency_ms, hints, replays, loop, input FROM conv_attempts WHERE profile_id = ?1 ORDER BY answered_at, id").bind(profileId),
  ]);
  const profile = profileResult.results[0];
  if (!isProfileRow(profile)) throw new Error("Profile row is missing");
  const retention = retentionResult.results[0];
  if (!isRetentionRow(retention)) throw new Error("Conversation retention row is invalid");
  const attempts = attemptsResult.results.filter(isAttemptRow);
  const today = zonedDayKey(now, profile.timezone);
  const calendar = Array.from({ length: CALENDAR_DAYS }, (_, index) => ({ date: addDays(today, index - CALENDAR_DAYS + 1), count: 0 }));
  const calendarCounts = new Map(calendar.map((day) => [day.date, day]));
  for (const attempt of attempts) {
    if (attempt.input !== "voice") continue;
    const day = calendarCounts.get(zonedDayKey(new Date(attempt.answered_at), profile.timezone));
    if (day) day.count += 1;
  }
  const firstTries = new Map<string, AttemptRow>();
  for (const attempt of attempts) {
    if (attempt.input !== "voice" || (attempt.loop !== "drill" && attempt.loop !== "roleplay")) continue;
    const key = `${attempt.chunk_id}:${zonedDayKey(new Date(attempt.answered_at), profile.timezone)}`;
    if (!firstTries.has(key)) firstTries.set(key, attempt);
  }
  const unaided = [...firstTries.values()];
  const onset = attempts.filter((attempt) => attempt.input === "voice" && attempt.latency_ms !== null && attempt.latency_ms <= 8_000).map((attempt) => attempt.latency_ms!);
  const firstScenes = new Map<number, AttemptRow>();
  let transferTotal = 0;
  let transferSuccesses = 0;
  for (const attempt of attempts) {
    if (attempt.scene_id === null) continue;
    const first = firstScenes.get(attempt.chunk_id);
    if (!first) {
      firstScenes.set(attempt.chunk_id, attempt);
      continue;
    }
    if (attempt.scene_id === first.scene_id) continue;
    transferTotal += 1;
    if (attempt.grade >= 3 && attempt.hints === 0) transferSuccesses += 1;
  }
  const weekStart = addDays(today, -6);
  return {
    calendar,
    spokenDaysThisWeek: calendar.filter((day) => day.date >= weekStart && day.count > 0).length,
    spokenChunkRetention: retention.total === 0 ? null : retention.retained ?? 0,
    unaidedFirstTryRate: rate(unaided.filter((attempt) => attempt.hints === 0 && attempt.replays === 0 && attempt.grade >= 3).length, unaided.length),
    medianOnsetLatencyMs: median(onset),
    transferRate: rate(transferSuccesses, transferTotal),
  };
}
