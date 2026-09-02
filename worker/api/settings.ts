import type { OnboardingStateResponse, PatchSettingsRequest, SettingsResponse } from "../../src/shared/api";
import { normalizeDailyGoal, ONYOMI_SCRIPTS, THEME_IDS, type OnyomiScript, type ThemeId } from "../../src/shared/settings";
import { TRACKS, type Track } from "../../src/shared/types";

type ProfileRow = { enabled_tracks: string; daily_goal: number; timezone: string; onyomi_script: OnyomiScript; theme: ThemeId; is_admin: number; onboarded_at?: number | null };

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function parseSettingsPatch(value: unknown): PatchSettingsRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.enabledTracks === undefined && body.dailyGoal === undefined && body.timezone === undefined && body.onyomiScript === undefined && body.theme === undefined) return null;
  if (body.enabledTracks !== undefined && (!Array.isArray(body.enabledTracks) || body.enabledTracks.length === 0 || !body.enabledTracks.every((track) => typeof track === "string" && TRACKS.includes(track as Track)))) return null;
  if (body.dailyGoal !== undefined && (typeof body.dailyGoal !== "number" || !Number.isFinite(body.dailyGoal))) return null;
  if (body.timezone !== undefined && (typeof body.timezone !== "string" || !validTimezone(body.timezone))) return null;
  if (body.onyomiScript !== undefined && (typeof body.onyomiScript !== "string" || !ONYOMI_SCRIPTS.includes(body.onyomiScript as OnyomiScript))) return null;
  if (body.theme !== undefined && (typeof body.theme !== "string" || !THEME_IDS.includes(body.theme as ThemeId))) return null;
  return {
    ...(body.enabledTracks === undefined ? {} : { enabledTracks: [...new Set(body.enabledTracks as Track[])] }),
    ...(body.dailyGoal === undefined ? {} : { dailyGoal: normalizeDailyGoal(body.dailyGoal as number) }),
    ...(body.timezone === undefined ? {} : { timezone: body.timezone as string }),
    ...(body.onyomiScript === undefined ? {} : { onyomiScript: body.onyomiScript as OnyomiScript }),
    ...(body.theme === undefined ? {} : { theme: body.theme as ThemeId }),
  };
}

function decode(row: ProfileRow): SettingsResponse {
  const parsed = JSON.parse(row.enabled_tracks) as unknown;
  const enabledTracks = Array.isArray(parsed) ? TRACKS.filter((track) => parsed.includes(track)) : [];
  if (enabledTracks.length === 0) throw new Error("Profile has no enabled tracks");
  return { enabledTracks, dailyGoal: row.daily_goal, timezone: row.timezone, onyomiScript: row.onyomi_script, theme: row.theme, isAdmin: Boolean(row.is_admin) };
}

export async function getSettings(db: D1Database, profileId: number): Promise<SettingsResponse> {
  const row = await db.prepare("SELECT enabled_tracks, daily_goal, timezone, onyomi_script, theme, is_admin FROM profile WHERE id = ?1").bind(profileId).first<ProfileRow>();
  if (!row) throw new Error("Profile row is missing");
  return decode(row);
}

export async function patchSettings(db: D1Database, profileId: number, patch: PatchSettingsRequest, now = new Date()): Promise<SettingsResponse> {
  const current = await getSettings(db, profileId);
  await db.prepare(`
    UPDATE profile SET enabled_tracks = ?1, daily_goal = ?2,
      timezone = COALESCE(?3, timezone), onyomi_script = ?4, theme = ?5, updated_at = ?6 WHERE id = ?7
  `).bind(JSON.stringify(patch.enabledTracks ?? current.enabledTracks), patch.dailyGoal ?? current.dailyGoal, patch.timezone ?? null, patch.onyomiScript ?? current.onyomiScript, patch.theme ?? current.theme, now.getTime(), profileId).run();
  return getSettings(db, profileId);
}

export async function getOnboardingState(db: D1Database, profileId: number): Promise<OnboardingStateResponse> {
  const row = await db.prepare("SELECT onboarded_at FROM profile WHERE id = ?1").bind(profileId).first<ProfileRow>();
  return { onboarded: row?.onboarded_at != null };
}
