import type { StatsResponse } from "../../src/shared/api";
import { MASTERY_STABILITY_DAYS } from "../../src/shared/mastery";
import { TRACKS, type Track } from "../../src/shared/types";
import { streaks, zonedDayKey } from "./sessions";

const CALENDAR_DAYS = 126;
const DAY_MS = 86_400_000;
type ProfileRow = { enabled_tracks: string; timezone: string };
type LogRow = { answered_at: number };
type MasteryRow = { track: Track; known: number; total: number };
type LevelRow = { track: Track; level_ord: number; level_badge: string };
type PlacementRow = { track: Track; level_badge: string; level_ord: number };
type SessionRow = { ended_at: number };

function addDays(key: string, amount: number): string {
  const date = new Date(`${key}T00:00:00Z`);
  return new Date(date.getTime() + amount * DAY_MS).toISOString().slice(0, 10);
}

export async function getStats(db: D1Database, now = new Date()): Promise<StatsResponse> {
  const [profileResult, logsResult, masteryResult, levelsResult, placementResult, sessionsResult] = await db.batch([
    db.prepare("SELECT enabled_tracks, timezone FROM profile WHERE id = 1"),
    db.prepare("SELECT answered_at FROM review_log ORDER BY answered_at"),
    db.prepare(`
      SELECT ct.track, COUNT(*) AS total,
        SUM(CASE WHEN rs.stability >= ?1 THEN 1 ELSE 0 END) AS known
      FROM character_tracks ct
      LEFT JOIN review_states rs ON rs.character_id = ct.character_id AND rs.track = ct.track
      GROUP BY ct.track
    `).bind(MASTERY_STABILITY_DAYS),
    db.prepare(`
      SELECT track, level_ord,
        CASE track WHEN 'kr' THEN kr_level WHEN 'jp' THEN jp_kanken ELSE cn_hsk END AS level_badge
      FROM character_tracks GROUP BY track, level_ord, level_badge ORDER BY track, level_ord
    `),
    db.prepare(`
      SELECT pr.track, pr.level_badge, pr.level_ord FROM placement_results pr
      WHERE pr.id = (SELECT latest.id FROM placement_results latest WHERE latest.track = pr.track ORDER BY latest.taken_at DESC, latest.id DESC LIMIT 1)
    `),
    db.prepare("SELECT ended_at FROM sessions"),
  ]);
  const profile = profileResult.results[0] as unknown as ProfileRow | undefined;
  if (!profile) throw new Error("Profile row is missing");
  const parsedTracks = JSON.parse(profile.enabled_tracks) as unknown;
  const enabledTracks = Array.isArray(parsedTracks) ? TRACKS.filter((track) => parsedTracks.includes(track)) : [];
  const counts = new Map<string, number>();
  for (const row of logsResult.results as unknown as LogRow[]) {
    const key = zonedDayKey(new Date(row.answered_at), profile.timezone);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const today = zonedDayKey(now, profile.timezone);
  const calendar = Array.from({ length: CALENDAR_DAYS }, (_, index) => {
    const date = addDays(today, index - CALENDAR_DAYS + 1);
    return { date, count: counts.get(date) ?? 0 };
  });
  const activeDays = [...counts.keys(), ...(sessionsResult.results as unknown as SessionRow[]).map((row) => zonedDayKey(new Date(row.ended_at), profile.timezone))];
  const streak = streaks(activeDays, new Date(`${today}T12:00:00Z`));
  const mastery = new Map((masteryResult.results as unknown as MasteryRow[]).map((row) => [row.track, row]));
  const levels = levelsResult.results as unknown as LevelRow[];
  const placements = new Map((placementResult.results as unknown as PlacementRow[]).map((row) => [row.track, row]));
  const tracks = enabledTracks.map((track) => {
    const progress = mastery.get(track) ?? { track, known: 0, total: 0 };
    const trackLevels = levels.filter((level) => level.track === track);
    const currentPlacement = placements.get(track);
    const currentIndex = currentPlacement ? trackLevels.findIndex((level) => level.level_ord >= currentPlacement.level_ord) : 0;
    const current = currentPlacement?.level_badge ?? trackLevels[Math.max(0, currentIndex)]?.level_badge ?? "시작 전";
    const nextLevel = trackLevels[Math.max(0, currentIndex) + 1]?.level_badge;
    return { track, known: progress.known, total: progress.total, pct: progress.total === 0 ? 0 : progress.known / progress.total * 100, currentLevel: current, ...(nextLevel ? { nextLevel } : {}) };
  });
  return { streak: streak.streak, longestStreak: streak.longestStreak, calendar, tracks };
}
