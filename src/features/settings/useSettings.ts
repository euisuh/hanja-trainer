import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../lib/apiClient";
import { DAILY_GOAL, DEFAULT_DAILY_GOAL, normalizeDailyGoal } from "../../shared/settings";
import { TRACKS, type Track } from "../../shared/types";

export { DAILY_GOAL, normalizeDailyGoal };

let timezoneSent = false;

export function toggleTrack(enabledTracks: Track[], track: Track): Track[] {
  if (!enabledTracks.includes(track)) return [...enabledTracks, track];
  return enabledTracks.length === 1 ? enabledTracks : enabledTracks.filter((candidate) => candidate !== track);
}

export function useSettings() {
  const [enabledTracks, setEnabledTracks] = useState<Track[]>([...TRACKS]);
  const [dailyGoal, setDailyGoal] = useState(DEFAULT_DAILY_GOAL);
  const [ready, setReady] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    apiClient.settings(controller.signal).then((settings) => {
      setEnabledTracks(settings.enabledTracks);
      setDailyGoal(settings.dailyGoal);
      setReady(true);
      const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!timezoneSent && settings.timezone !== detectedTimezone) {
        timezoneSent = true;
        void apiClient.patchSettings({ timezone: detectedTimezone }).catch(() => { timezoneSent = false; });
      }
    }).catch(() => { if (!controller.signal.aborted) setReady(true); });
    return () => {
      controller.abort();
      window.clearTimeout(timer.current);
    };
  }, []);

  function persist(tracks: Track[], goal: number) {
    setEnabledTracks(tracks);
    setDailyGoal(goal);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void apiClient.patchSettings({ enabledTracks: tracks, dailyGoal: goal }).then((settings) => {
        setEnabledTracks(settings.enabledTracks);
        setDailyGoal(settings.dailyGoal);
      }).catch(() => apiClient.settings().then((settings) => {
        setEnabledTracks(settings.enabledTracks);
        setDailyGoal(settings.dailyGoal);
      }).catch(() => undefined));
    }, 150);
  }

  return {
    enabledTracks,
    dailyGoal,
    ready,
    toggle: (track: Track) => persist(toggleTrack(enabledTracks, track), dailyGoal),
    setGoal: (goal: number) => persist(enabledTracks, normalizeDailyGoal(goal)),
  };
}
