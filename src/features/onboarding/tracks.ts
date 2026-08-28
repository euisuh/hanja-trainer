import type { PlacementResult } from "../placement/adaptive";
import { TRACKS, type Track } from "../../shared/types";

export type OnboardingProfile = {
  enabledTracks: Track[];
  placement: PlacementResult[];
  completed: boolean;
};

const storageKey = "hanja-trainer.onboarding";
const emptyProfile: OnboardingProfile = { enabledTracks: [...TRACKS], placement: [], completed: false };

export function loadOnboardingProfile(): OnboardingProfile {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null") as OnboardingProfile | null;
    if (!stored) return emptyProfile;
    const enabledTracks = TRACKS.filter((track) => stored.enabledTracks?.includes(track));
    return { ...stored, enabledTracks: enabledTracks.length > 0 ? enabledTracks : [...TRACKS] };
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
