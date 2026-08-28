import type { PlacementResult } from "../placement/adaptive";
import { TRACKS, type Track } from "../../shared/types";

export type OnboardingProfile = {
  enabledTracks: Track[];
  placement: PlacementResult[];
  completed: boolean;
  dailyGoal: number;
};

const storageKey = "hanja-trainer.onboarding";
export const DEFAULT_DAILY_GOAL = 40;
export const DAILY_GOAL = { min: 10, max: 120, step: 10 } as const;
export const SETTINGS_CHANGED_EVENT = "hanja-trainer.settings-changed";
const emptyProfile: OnboardingProfile = { enabledTracks: [...TRACKS], placement: [], completed: false, dailyGoal: DEFAULT_DAILY_GOAL };

export function normalizeDailyGoal(value: number): number {
  const stepped = Math.round(value / DAILY_GOAL.step) * DAILY_GOAL.step;
  return Math.max(DAILY_GOAL.min, Math.min(DAILY_GOAL.max, stepped));
}

export function loadOnboardingProfile(): OnboardingProfile {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null") as OnboardingProfile | null;
    if (!stored) return emptyProfile;
    const enabledTracks = TRACKS.filter((track) => stored.enabledTracks?.includes(track));
    return { ...stored, enabledTracks: enabledTracks.length > 0 ? enabledTracks : [...TRACKS], dailyGoal: normalizeDailyGoal(Number.isFinite(stored.dailyGoal) ? stored.dailyGoal : DEFAULT_DAILY_GOAL) };
  } catch {
    return emptyProfile;
  }
}

// ponytail: local persistence bridges the first-run UI until #16 owns this profile.
export function saveEnabledTracks(enabledTracks: Track[]) {
  localStorage.setItem(storageKey, JSON.stringify({ ...loadOnboardingProfile(), enabledTracks }));
}

export function savePlacementResults(placement: PlacementResult[]) {
  localStorage.setItem(storageKey, JSON.stringify({ ...loadOnboardingProfile(), placement, completed: true }));
}

export function saveSettings(enabledTracks: Track[], dailyGoal: number) {
  localStorage.setItem(storageKey, JSON.stringify({ ...loadOnboardingProfile(), enabledTracks, dailyGoal }));
  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
}
