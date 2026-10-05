/* oxlint-disable anti-slop/no-conditional-empty-object-spread, anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion -- Existing settings request parser validates untyped HTTP JSON at its shared boundary. */
import type { PatchSettingsRequest } from "./api";
import { TRACKS, type Track } from "./types";

export const DEFAULT_DAILY_GOAL = 40;
export const DAILY_GOAL = { min: 10, max: 120, step: 10 } as const;
export const ONYOMI_SCRIPTS = ["katakana", "hiragana"] as const;
export type OnyomiScript = (typeof ONYOMI_SCRIPTS)[number];
export const SOUND_MODES = ["on", "off"] as const;
export type SoundMode = (typeof SOUND_MODES)[number];
export const DEFAULT_SOUND_MODE: SoundMode = "on";
export const THEME_IDS = ["default", "quiet-technical"] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const APPEARANCE_IDS = ["classic", "notebook"] as const;
export type AppearanceId = (typeof APPEARANCE_IDS)[number];

export function normalizeDailyGoal(value: number): number {
  const stepped = Math.round(value / DAILY_GOAL.step) * DAILY_GOAL.step;
  return Math.max(DAILY_GOAL.min, Math.min(DAILY_GOAL.max, stepped));
}

export function normalizeSettingsPatch(value: unknown): PatchSettingsRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.enabledTracks === undefined && body.dailyGoal === undefined && body.timezone === undefined && body.onyomiScript === undefined && body.soundMode === undefined && body.theme === undefined && body.appearance === undefined) return null;
  if (body.enabledTracks !== undefined && (!Array.isArray(body.enabledTracks) || body.enabledTracks.length === 0 || !body.enabledTracks.every((track) => typeof track === "string" && TRACKS.includes(track as Track)))) return null;
  if (body.dailyGoal !== undefined && (typeof body.dailyGoal !== "number" || !Number.isFinite(body.dailyGoal))) return null;
  if (body.timezone !== undefined) {
    if (typeof body.timezone !== "string") return null;
    try { new Intl.DateTimeFormat("en", { timeZone: body.timezone }).format(); } catch { return null; }
  }
  if (body.onyomiScript !== undefined && (typeof body.onyomiScript !== "string" || !ONYOMI_SCRIPTS.includes(body.onyomiScript as OnyomiScript))) return null;
  if (body.soundMode !== undefined && (typeof body.soundMode !== "string" || !SOUND_MODES.includes(body.soundMode as SoundMode))) return null;
  if (body.theme !== undefined && (typeof body.theme !== "string" || !THEME_IDS.includes(body.theme as ThemeId))) return null;
  if (body.appearance !== undefined && (typeof body.appearance !== "string" || !APPEARANCE_IDS.includes(body.appearance as AppearanceId))) return null;
  return {
    ...(body.enabledTracks === undefined ? {} : { enabledTracks: [...new Set(body.enabledTracks as Track[])] }),
    ...(body.dailyGoal === undefined ? {} : { dailyGoal: normalizeDailyGoal(body.dailyGoal as number) }),
    ...(body.timezone === undefined ? {} : { timezone: body.timezone }),
    ...(body.onyomiScript === undefined ? {} : { onyomiScript: body.onyomiScript as OnyomiScript }),
    ...(body.soundMode === undefined ? {} : { soundMode: body.soundMode as SoundMode }),
    ...(body.theme === undefined ? {} : { theme: body.theme as ThemeId }),
    ...(body.appearance === undefined ? {} : { appearance: body.appearance as AppearanceId }),
  };
}
