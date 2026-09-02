import { useEffect, useRef, useState } from "react";
import { SETTINGS_UPDATED_EVENT, apiClient } from "../../lib/apiClient";
import { DAILY_GOAL, DEFAULT_DAILY_GOAL, normalizeDailyGoal, type OnyomiScript, type ThemeId } from "../../shared/settings";
import { TRACKS, type Track } from "../../shared/types";

export { DAILY_GOAL, normalizeDailyGoal };

let timezoneSent = false;

export function resetSettingsClientState() {
  timezoneSent = false;
}

export function toggleTrack(enabledTracks: Track[], track: Track): Track[] {
  if (!enabledTracks.includes(track)) return [...enabledTracks, track];
  return enabledTracks.length === 1 ? enabledTracks : enabledTracks.filter((candidate) => candidate !== track);
}

export function useSettings() {
  const [enabledTracks, setEnabledTracks] = useState<Track[]>([...TRACKS]);
  const [dailyGoal, setDailyGoal] = useState(DEFAULT_DAILY_GOAL);
  const [onyomiScript, setOnyomiScript] = useState<OnyomiScript>("katakana");
  const [theme, setTheme] = useState<ThemeId>("quiet-technical");
  const [isAdmin, setIsAdmin] = useState(false);
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
      setTheme(settings.theme);
      setIsAdmin(settings.isAdmin);
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

  function persist(tracks: Track[], goal: number, script: OnyomiScript, visualTheme: ThemeId) {
    setEnabledTracks(tracks);
    setDailyGoal(goal);
    setOnyomiScript(script);
    setTheme(visualTheme);
    window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT, { detail: { theme: visualTheme } }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void apiClient.patchSettings({ enabledTracks: tracks, dailyGoal: goal, onyomiScript: script, theme: visualTheme }).then((settings) => {
        setEnabledTracks(settings.enabledTracks);
        setDailyGoal(settings.dailyGoal);
        setOnyomiScript(settings.onyomiScript);
        setTheme(settings.theme);
        setIsAdmin(settings.isAdmin);
      }).catch(() => apiClient.settings().then((settings) => {
        setEnabledTracks(settings.enabledTracks);
        setDailyGoal(settings.dailyGoal);
        setOnyomiScript(settings.onyomiScript);
        setTheme(settings.theme);
        setIsAdmin(settings.isAdmin);
        window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT, { detail: { theme: settings.theme } }));
      }).catch(() => undefined));
    }, 150);
  }

  return {
    enabledTracks,
    dailyGoal,
    onyomiScript,
    theme,
    isAdmin,
    error,
    ready,
    retry: () => setRetryKey((value) => value + 1),
    flush: async () => {
      window.clearTimeout(timer.current);
      const settings = await apiClient.patchSettings({ enabledTracks, dailyGoal, onyomiScript, theme });
      setEnabledTracks(settings.enabledTracks);
      setDailyGoal(settings.dailyGoal);
      setOnyomiScript(settings.onyomiScript);
      setTheme(settings.theme);
      setIsAdmin(settings.isAdmin);
    },
    toggle: (track: Track) => persist(toggleTrack(enabledTracks, track), dailyGoal, onyomiScript, theme),
    setGoal: (goal: number) => persist(enabledTracks, normalizeDailyGoal(goal), onyomiScript, theme),
    setOnyomiScript: (script: OnyomiScript) => persist(enabledTracks, dailyGoal, script, theme),
    setTheme: (next: ThemeId) => persist(enabledTracks, dailyGoal, onyomiScript, next),
  };
}
