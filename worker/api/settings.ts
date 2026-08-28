import type { OnboardingStateResponse, PatchSettingsRequest, SettingsResponse } from "../../src/shared/api";
import { normalizeDailyGoal } from "../../src/shared/settings";
import { TRACKS, type Track } from "../../src/shared/types";

type ProfileRow = { enabled_tracks: string; daily_goal: number; timezone: string; onboarded_at?: number | null };

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
  if (body.enabledTracks === undefined && body.dailyGoal === undefined && body.timezone === undefined) return null;
  if (body.enabledTracks !== undefined && (!Array.isArray(body.enabledTracks) || body.enabledTracks.length === 0 || !body.enabledTracks.every((track) => typeof track === "string" && TRACKS.includes(track as Track)))) return null;
  if (body.dailyGoal !== undefined && (typeof body.dailyGoal !== "number" || !Number.isFinite(body.dailyGoal))) return null;
  if (body.timezone !== undefined && (typeof body.timezone !== "string" || !validTimezone(body.timezone))) return null;
  return {
    ...(body.enabledTracks === undefined ? {} : { enabledTracks: [...new Set(body.enabledTracks as Track[])] }),
    ...(body.dailyGoal === undefined ? {} : { dailyGoal: normalizeDailyGoal(body.dailyGoal as number) }),
    ...(body.timezone === undefined ? {} : { timezone: body.timezone as string }),
  };
}

function decode(row: ProfileRow): SettingsResponse {
  const parsed = JSON.parse(row.enabled_tracks) as unknown;
  const enabledTracks = Array.isArray(parsed) ? TRACKS.filter((track) => parsed.includes(track)) : [];
  if (enabledTracks.length === 0) throw new Error("Profile has no enabled tracks");
  return { enabledTracks, dailyGoal: row.daily_goal, timezone: row.timezone };
}

export async function getSettings(db: D1Database): Promise<SettingsResponse> {
  const row = await db.prepare("SELECT enabled_tracks, daily_goal, timezone FROM profile WHERE id = 1").first<ProfileRow>();
  if (!row) throw new Error("Profile row is missing");
  return decode(row);
}

export async function patchSettings(db: D1Database, patch: PatchSettingsRequest, now = new Date()): Promise<SettingsResponse> {
  const current = await getSettings(db);
  await db.prepare(`
    UPDATE profile SET enabled_tracks = ?1, daily_goal = ?2,
      timezone = COALESCE(?3, timezone), updated_at = ?4 WHERE id = 1
  `).bind(JSON.stringify(patch.enabledTracks ?? current.enabledTracks), patch.dailyGoal ?? current.dailyGoal, patch.timezone ?? null, now.getTime()).run();
  return getSettings(db);
}

export async function getOnboardingState(db: D1Database): Promise<OnboardingStateResponse> {
  const row = await db.prepare("SELECT onboarded_at FROM profile WHERE id = 1").first<ProfileRow>();
  return { onboarded: row?.onboarded_at != null };
}
