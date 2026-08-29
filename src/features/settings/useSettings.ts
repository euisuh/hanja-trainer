import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../lib/apiClient";
import { DAILY_GOAL, DEFAULT_DAILY_GOAL, normalizeDailyGoal, type OnyomiScript } from "../../shared/settings";
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
  const [onyomiScript, setOnyomiScript] = useState<OnyomiScript>("katakana");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    apiClient.settings(controller.signal).then((settings) => {
      setEnabledTracks(settings.enabledTracks);
      setDailyGoal(settings.dailyGoal);
      setOnyomiScript(settings.onyomiScript);
      setError("");
      setReady(true);
      const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!timezoneSent && settings.timezone !== detectedTimezone) {
        timezoneSent = true;
        void apiClient.patchSettings({ timezone: detectedTimezone }).catch(() => { timezoneSent = false; });
      }
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) {
        setError(caught instanceof Error ? caught.message : "설정을 불러오지 못했습니다.");
        setReady(true);
      }
    });
    return () => {
      controller.abort();
      window.clearTimeout(timer.current);
    };
  }, [retryKey]);

  function persist(tracks: Track[], goal: number, script: OnyomiScript) {
    setEnabledTracks(tracks);
    setDailyGoal(goal);
    setOnyomiScript(script);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void apiClient.patchSettings({ enabledTracks: tracks, dailyGoal: goal, onyomiScript: script }).then((settings) => {
        setEnabledTracks(settings.enabledTracks);
        setDailyGoal(settings.dailyGoal);
        setOnyomiScript(settings.onyomiScript);
      }).catch(() => apiClient.settings().then((settings) => {
        setEnabledTracks(settings.enabledTracks);
        setDailyGoal(settings.dailyGoal);
        setOnyomiScript(settings.onyomiScript);
      }).catch(() => undefined));
    }, 150);
  }

  return {
    enabledTracks,
    dailyGoal,
    onyomiScript,
    error,
    ready,
    retry: () => setRetryKey((value) => value + 1),
    flush: async () => {
      window.clearTimeout(timer.current);
      const settings = await apiClient.patchSettings({ enabledTracks, dailyGoal, onyomiScript });
      setEnabledTracks(settings.enabledTracks);
      setDailyGoal(settings.dailyGoal);
      setOnyomiScript(settings.onyomiScript);
    },
    toggle: (track: Track) => persist(toggleTrack(enabledTracks, track), dailyGoal, onyomiScript),
    setGoal: (goal: number) => persist(enabledTracks, normalizeDailyGoal(goal), onyomiScript),
    setOnyomiScript: (script: OnyomiScript) => persist(enabledTracks, dailyGoal, script),
  };
}
