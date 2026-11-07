/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/require-safety-comment-for-type-assertion -- Existing settings HTTP boundary delegates request parsing to shared validation. */
import type { OnboardingStateResponse, PatchSettingsRequest, SettingsResponse } from "../../shared/api";
import { normalizeSettingsPatch, type OnyomiScript, type SoundMode } from "../../shared/settings";
import { TRACKS } from "../../shared/types";

type ProfileRow = { enabled_tracks: string; daily_goal: number; timezone: string; onyomi_script: OnyomiScript; sound_mode: SoundMode; is_admin: number; onboarded_at?: number | null };

export function parseSettingsPatch(value: unknown): PatchSettingsRequest | null {
  return normalizeSettingsPatch(value);
}

function decode(row: ProfileRow): SettingsResponse {
  const parsed = JSON.parse(row.enabled_tracks) as unknown;
  const enabledTracks = Array.isArray(parsed) ? TRACKS.filter((track) => parsed.includes(track)) : [];
  if (enabledTracks.length === 0) throw new Error("Profile has no enabled tracks");
  return { enabledTracks, dailyGoal: row.daily_goal, timezone: row.timezone, onyomiScript: row.onyomi_script, soundMode: row.sound_mode, isAdmin: Boolean(row.is_admin) };
}

export async function getSettings(db: D1Database, profileId: number): Promise<SettingsResponse> {
  const row = await db.prepare("SELECT enabled_tracks, daily_goal, timezone, onyomi_script, sound_mode, is_admin FROM profile WHERE id = ?1").bind(profileId).first<ProfileRow>();
  if (!row) throw new Error("Profile row is missing");
  return decode(row);
}

export async function patchSettings(db: D1Database, profileId: number, patch: PatchSettingsRequest, now = new Date()): Promise<SettingsResponse> {
  await db.prepare(`
    UPDATE profile SET enabled_tracks = COALESCE(?1, enabled_tracks), daily_goal = COALESCE(?2, daily_goal),
      timezone = COALESCE(?3, timezone), onyomi_script = COALESCE(?4, onyomi_script), sound_mode = COALESCE(?5, sound_mode),
      updated_at = ?6 WHERE id = ?7
  `).bind(patch.enabledTracks ? JSON.stringify(patch.enabledTracks) : null, patch.dailyGoal ?? null, patch.timezone ?? null, patch.onyomiScript ?? null, patch.soundMode ?? null, now.getTime(), profileId).run();
  return getSettings(db, profileId);
}

export async function getOnboardingState(db: D1Database, profileId: number): Promise<OnboardingStateResponse> {
  const row = await db.prepare("SELECT onboarded_at FROM profile WHERE id = ?1").bind(profileId).first<ProfileRow>();
  return { onboarded: row?.onboarded_at != null };
}
