/* oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/no-known-value-widening, anti-slop/require-safety-comment-for-type-assertion -- Existing D1 row mapping predates changed-file lint; rows come from fixed SELECT column lists. */
import type { CreateSessionRequest, ProfileResponse } from "../../shared/api";
import { TRACKS } from "../../shared/types";

export { parseSessionRequest } from "../../shared/session";

const DAY_MS = 86_400_000;
type ProfileRow = { id: number; name: string; is_admin: number; is_demo: number; enabled_tracks: string; daily_goal: number; timezone: string; xp: number };
type ActivityRangeRow = { min_at: number | null; max_at: number | null };
type DailyXpRow = { day: string; xp: number };
type DailyRow = { day: string };
type OffsetPeriod = { until?: number; offset: number };

const dayFormatters = new Map<string, Intl.DateTimeFormat>();
// A zone changes offset at most twice a year, so cache each small yearly answer for the isolate's lifetime.
// The cache is bounded by the profile timezones and years of history this isolate sees.
const yearTransitions = new Map<string, OffsetPeriod[]>();

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
  let formatter = dayFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    dayFormatters.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function timezoneOffset(timestamp: number, timezone: string): number {
  let formatter = dayFormatters.get(timezone);
  if (!formatter) {
    zonedDayKey(new Date(timestamp), timezone);
    formatter = dayFormatters.get(timezone)!;
  }
  const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
  const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return local - Math.floor(timestamp / 1_000) * 1_000;
}

function transitionsForYear(timezone: string, year: number): OffsetPeriod[] {
  const key = `${timezone}:${year}`;
  const cached = yearTransitions.get(key);
  if (cached) return cached;
  const periods: OffsetPeriod[] = [];
  let previousAt = Date.UTC(year, 0, 1);
  let previousOffset = timezoneOffset(previousAt, timezone);
  for (let month = 1; month <= 12; month += 1) {
    const sample = Date.UTC(year, month, 1);
    const nextOffset = timezoneOffset(sample, timezone);
    if (nextOffset === previousOffset) {
      previousAt = sample;
      continue;
    }
    let low = previousAt;
    let high = sample;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (timezoneOffset(middle, timezone) === previousOffset) low = middle;
      else high = middle;
    }
    periods.push({ until: high, offset: previousOffset });
    previousOffset = timezoneOffset(high, timezone);
    previousAt = sample;
  }
  periods.push({ offset: previousOffset });
  yearTransitions.set(key, periods);
  return periods;
}

export function offsetPeriods(timezone: string, minAt: number | null, maxAt: number | null): OffsetPeriod[] {
  if (minAt === null || maxAt === null) return [{ offset: 0 }];
  const start = Math.floor(minAt / DAY_MS) * DAY_MS - DAY_MS;
  const end = Math.ceil(maxAt / DAY_MS) * DAY_MS + DAY_MS;
  const periods: OffsetPeriod[] = [];
  const firstYear = new Date(start).getUTCFullYear();
  const lastYear = new Date(end).getUTCFullYear();
  const initial = transitionsForYear(timezone, firstYear);
  let previousOffset = initial.find((period) => period.until === undefined || start < period.until)!.offset;
  for (let year = firstYear; year <= lastYear; year += 1) {
    const yearly = transitionsForYear(timezone, year);
    for (let index = 0; index < yearly.length - 1; index += 1) {
      const until = yearly[index].until!;
      if (until <= start || until > end) continue;
      const nextOffset = yearly[index + 1].offset;
      if (nextOffset === previousOffset) continue;
      periods.push({ until, offset: previousOffset });
      previousOffset = nextOffset;
    }
  }
  periods.push({ offset: previousOffset });
  return periods;
}

function localDaySql(column: "answered_at" | "ended_at", periods: OffsetPeriod[]): string {
  const offset = periods.length === 1
    ? String(periods[0].offset)
    : `CASE ${periods.map((period) => period.until === undefined ? `ELSE ${period.offset}` : `WHEN ${column} < ${period.until} THEN ${period.offset}`).join(" ")} END`;
  return `strftime('%Y-%m-%d', (${column} + (${offset})) / 1000.0, 'unixepoch')`;
}

export function activityDaySql(timezone: string, minAt: number | null, maxAt: number | null): { review: string; session: string } {
  const periods = offsetPeriods(timezone, minAt, maxAt);
  return { review: localDaySql("answered_at", periods), session: localDaySql("ended_at", periods) };
}

export async function getProfile(db: D1Database, profileId: number, now = new Date()): Promise<ProfileResponse> {
  const [profileResult, rangeResult] = await db.batch([
    db.prepare("SELECT id, name, is_admin, is_demo, enabled_tracks, daily_goal, timezone, xp FROM profile WHERE id = ?1").bind(profileId),
    db.prepare(`
      SELECT MIN(value) AS min_at, MAX(value) AS max_at FROM (
        SELECT MIN(answered_at) AS value FROM review_log WHERE profile_id = ?1
        UNION ALL SELECT MAX(answered_at) FROM review_log WHERE profile_id = ?1
        UNION ALL SELECT MIN(ended_at) FROM sessions WHERE profile_id = ?1
        UNION ALL SELECT MAX(ended_at) FROM sessions WHERE profile_id = ?1
      )
    `).bind(profileId),
  ]);
  const profile = profileResult.results[0] as unknown as ProfileRow | undefined;
  if (!profile) throw new Error("Profile row is missing");
  const parsed = JSON.parse(profile.enabled_tracks) as unknown;
  const enabledTracks = Array.isArray(parsed) ? TRACKS.filter((track) => parsed.includes(track)) : [...TRACKS];
  const today = zonedDayKey(now, profile.timezone);
  const range = rangeResult.results[0] as unknown as ActivityRangeRow | undefined;
  const days = activityDaySql(profile.timezone, range?.min_at ?? null, range?.max_at ?? null);
  const [sessionsResult, logsResult] = await db.batch([
    db.prepare(`SELECT ${days.session} AS day, SUM(xp) AS xp FROM sessions WHERE profile_id = ?1 GROUP BY day ORDER BY day`).bind(profileId),
    db.prepare(`SELECT ${days.review} AS day FROM review_log WHERE profile_id = ?1 GROUP BY day ORDER BY day`).bind(profileId),
  ]);
  const sessionDays = sessionsResult.results as unknown as DailyXpRow[];
  const todayXp = sessionDays.find((row) => row.day === today)?.xp ?? 0;
  const activeDays = [
    ...sessionDays.map((row) => row.day),
    ...(logsResult.results as unknown as DailyRow[]).map((row) => row.day),
  ];
  return {
    id: profile.id,
    name: profile.name,
    isAdmin: Boolean(profile.is_admin),
    isGuest: Boolean(profile.is_demo),
    xp: profile.xp,
    todayXp,
    goal: profile.daily_goal,
    ...streaks(activeDays, new Date(`${today}T12:00:00Z`)),
    enabledTracks,
  };
}

export async function createSession(db: D1Database, profileId: number, input: CreateSessionRequest, now = new Date()): Promise<ProfileResponse> {
  const values = [profileId, input.mode, Date.parse(input.startedAt), Date.parse(input.endedAt), input.answered, input.correct, input.skipped, input.bestCombo, input.xp] as const;
  if (input.sessionId !== undefined) {
    await db.prepare(`
      INSERT INTO sessions (profile_id, client_session_id, mode, started_at, ended_at, answered, correct, skipped, best_combo, xp)
      VALUES (?1, ?10, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
      ON CONFLICT(profile_id, client_session_id) DO NOTHING
    `).bind(...values, input.sessionId).run();
  } else {
    await db.batch([
      db.prepare(`
      INSERT INTO sessions (profile_id, mode, started_at, ended_at, answered, correct, skipped, best_combo, xp)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
      `).bind(...values),
      db.prepare("UPDATE profile SET xp = xp + ?1, updated_at = ?2 WHERE id = ?3").bind(input.xp, now.getTime(), profileId),
    ]);
  }
  return getProfile(db, profileId, now);
}
