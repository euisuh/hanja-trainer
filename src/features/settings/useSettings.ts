import { useState } from "react";
import { DAILY_GOAL, loadOnboardingProfile, normalizeDailyGoal, saveSettings } from "../onboarding/tracks";
import type { Track } from "../../shared/types";

export { DAILY_GOAL, normalizeDailyGoal };

export function toggleTrack(enabledTracks: Track[], track: Track): Track[] {
  if (!enabledTracks.includes(track)) return [...enabledTracks, track];
  return enabledTracks.length === 1 ? enabledTracks : enabledTracks.filter((candidate) => candidate !== track);
}

export function useSettings() {
  const profile = loadOnboardingProfile();
  const [enabledTracks, setEnabledTracks] = useState(profile.enabledTracks);
  const [dailyGoal, setDailyGoal] = useState(() => normalizeDailyGoal(profile.dailyGoal));

  function persist(tracks: Track[], goal: number) {
    setEnabledTracks(tracks);
    setDailyGoal(goal);
    // ponytail: local optimistic store is replaced by #16's profile endpoint.
    saveSettings(tracks, goal);
  }

  return {
    enabledTracks,
    dailyGoal,
    toggle: (track: Track) => persist(toggleTrack(enabledTracks, track), dailyGoal),
    setGoal: (goal: number) => persist(enabledTracks, normalizeDailyGoal(goal)),
  };
}
