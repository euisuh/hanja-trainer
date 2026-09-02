import type { StatsResponse, StatsSecondaryScale } from "../../src/shared/api";
import { MASTERY_STABILITY_DAYS } from "../../src/shared/mastery";
import { TRACKS, type Track } from "../../src/shared/types";
import { activityDaySql, streaks, zonedDayKey } from "./sessions";

const CALENDAR_DAYS = 126;
const DAY_MS = 86_400_000;
const REVIEW_ATTEMPT_SQL = "CASE WHEN session_id IS NOT NULL AND card_index IS NOT NULL THEN json_array('submission', session_id, card_index) ELSE json_array('log', id) END";
type ProfileRow = { enabled_tracks: string; timezone: string };
type ActivityRangeRow = { min_at: number | null; max_at: number | null };
type DailyCountRow = { day: string; count: number };
type DailyRow = { day: string };
type MasteryRow = { track: Track; known: number; total: number };
type LevelRow = { track: Track; level_ord: number; level_badge: string };
type PlacementRow = { track: Track; level_badge: string; level_ord: number };
type ReviewTotalsRow = ActivityRangeRow & { answered: number; skipped: number };
type KankenRow = { level: string; stability: number | null };

const KANKEN_LEVELS = ["10級", "9級", "8級", "7級", "6級", "5級", "4級", "3級", "準2級", "2級", "準1級", "1級"] as const;

export function kankenProgress(rows: KankenRow[]): StatsSecondaryScale {
  const counts = new Map(KANKEN_LEVELS.map((level) => [level, { known: 0, total: 0 }]));
  for (const row of rows) {
    const count = counts.get(row.level as (typeof KANKEN_LEVELS)[number]);
    if (!count) continue;
    count.total += 1;
    if ((row.stability ?? 0) >= MASTERY_STABILITY_DAYS) count.known += 1;
  }
  const representedLevels = KANKEN_LEVELS.filter((level) => counts.get(level)!.total > 0);
  if (representedLevels.length === 0) return { name: "漢検", level: "開始前", known: 0, total: 0 };
  let current = "開始前";
  for (const level of representedLevels) {
    const count = counts.get(level)!;
    if (count.known / count.total < 0.8) {
      return { name: "漢検", level: current, ...count, nextLevel: level };
    }
    current = level;
  }
  return { name: "漢検", level: current, ...counts.get(representedLevels.at(-1)!)! };
}

function addDays(key: string, amount: number): string {
  const date = new Date(`${key}T00:00:00Z`);
  return new Date(date.getTime() + amount * DAY_MS).toISOString().slice(0, 10);
}

export async function getStats(db: D1Database, profileId: number, now = new Date()): Promise<StatsResponse> {
  const [profileResult, totalsResult, sessionsRangeResult, masteryResult, levelsResult, placementResult, kankenResult] = await db.batch([
    db.prepare("SELECT enabled_tracks, timezone FROM profile WHERE id = ?1").bind(profileId),
    db.prepare(`SELECT MIN(answered_at) AS min_at, MAX(answered_at) AS max_at,
      COUNT(DISTINCT ${REVIEW_ATTEMPT_SQL}) AS answered,
      COUNT(DISTINCT CASE WHEN skipped = 1 THEN ${REVIEW_ATTEMPT_SQL} END) AS skipped
      FROM review_log WHERE profile_id = ?1`).bind(profileId),
    db.prepare("SELECT MIN(ended_at) AS min_at, MAX(ended_at) AS max_at FROM sessions WHERE profile_id = ?1").bind(profileId),
    db.prepare(`
      SELECT ct.track, COUNT(*) AS total,
        SUM(CASE WHEN rs.stability >= ?1 THEN 1 ELSE 0 END) AS known
      FROM character_tracks ct
      LEFT JOIN review_states rs ON rs.profile_id = ?2 AND rs.character_id = ct.character_id AND rs.track = ct.track
      GROUP BY ct.track
    `).bind(MASTERY_STABILITY_DAYS, profileId),
    db.prepare(`
      SELECT track, level_ord,
        CASE track WHEN 'kr' THEN kr_level WHEN 'jp' THEN jp_jlpt ELSE cn_hsk END AS level_badge
      FROM character_tracks GROUP BY track, level_ord, level_badge ORDER BY track, level_ord
    `),
    db.prepare(`
      SELECT pr.track, pr.level_badge, pr.level_ord FROM placement_results pr
      WHERE pr.profile_id = ?1 AND pr.id = (SELECT latest.id FROM placement_results latest WHERE latest.profile_id = ?1 AND latest.track = pr.track ORDER BY latest.taken_at DESC, latest.id DESC LIMIT 1)
    `).bind(profileId),
    // Kanken remains secondary metadata for the JLPT-ordered Japanese curriculum.
    db.prepare(`
      SELECT ct.jp_kanken AS level, rs.stability
      FROM character_tracks ct
      LEFT JOIN review_states rs ON rs.profile_id = ?1 AND rs.character_id = ct.character_id AND rs.track = ct.track
      WHERE ct.track = 'jp' AND ct.jp_kanken IS NOT NULL
    `).bind(profileId),
  ]);
  const profile = profileResult.results[0] as unknown as ProfileRow | undefined;
  if (!profile) throw new Error("Profile row is missing");
  const parsedTracks = JSON.parse(profile.enabled_tracks) as unknown;
  const enabledTracks = Array.isArray(parsedTracks) ? TRACKS.filter((track) => parsedTracks.includes(track)) : [];
  const today = zonedDayKey(now, profile.timezone);
  const totals = totalsResult.results[0] as unknown as ReviewTotalsRow;
  const sessionRange = sessionsRangeResult.results[0] as unknown as ActivityRangeRow;
  const minAt = Math.min(...[totals.min_at, sessionRange.min_at].filter((value): value is number => value !== null));
  const maxAt = Math.max(...[totals.max_at, sessionRange.max_at].filter((value): value is number => value !== null));
  const days = activityDaySql(profile.timezone, Number.isFinite(minAt) ? minAt : null, Number.isFinite(maxAt) ? maxAt : null);
  const calendarStart = Date.parse(`${addDays(today, -CALENDAR_DAYS + 1)}T00:00:00Z`) - DAY_MS;
  const calendarEnd = Date.parse(`${addDays(today, 1)}T00:00:00Z`) + DAY_MS;
  const [logsResult, sessionsResult, calendarResult] = await db.batch([
    db.prepare(`SELECT ${days.review} AS day FROM review_log WHERE profile_id = ?1 GROUP BY day ORDER BY day`).bind(profileId),
    db.prepare(`SELECT ${days.session} AS day FROM sessions WHERE profile_id = ?1 GROUP BY day ORDER BY day`).bind(profileId),
    db.prepare(`SELECT ${days.review} AS day, COUNT(DISTINCT ${REVIEW_ATTEMPT_SQL}) AS count FROM review_log WHERE profile_id = ?1 AND answered_at >= ?2 AND answered_at < ?3 GROUP BY day ORDER BY day`).bind(profileId, calendarStart, calendarEnd),
  ]);
  const counts = new Map((calendarResult.results as unknown as DailyCountRow[]).map((row) => [row.day, row.count]));
  const calendar = Array.from({ length: CALENDAR_DAYS }, (_, index) => {
    const date = addDays(today, index - CALENDAR_DAYS + 1);
    return { date, count: counts.get(date) ?? 0 };
  });
  const activeDays = [
    ...(logsResult.results as unknown as DailyRow[]).map((row) => row.day),
    ...(sessionsResult.results as unknown as DailyRow[]).map((row) => row.day),
  ];
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
    return {
      track,
      known: progress.known,
      total: progress.total,
      pct: progress.total === 0 ? 0 : progress.known / progress.total * 100,
      currentLevel: current,
      ...(nextLevel ? { nextLevel } : {}),
      ...(track === "jp" ? { secondaryScale: kankenProgress(kankenResult.results as unknown as KankenRow[]) } : {}),
    };
  });
  return { streak: streak.streak, longestStreak: streak.longestStreak, calendar, tracks, answered: totals.answered, skipped: totals.skipped, skipRate: totals.answered === 0 ? 0 : totals.skipped / totals.answered * 100 };
}
