import { useEffect, useState } from "react";
import { PROFILE_UPDATED_EVENT, SETTINGS_UPDATED_EVENT, apiClient, isApiProfileId } from "../../lib/apiClient";
import type { PatchSettingsRequest, SettingsResponse } from "../../shared/api";
import { DAILY_GOAL, DEFAULT_DAILY_GOAL, DEFAULT_SOUND_MODE, normalizeDailyGoal, type OnyomiScript, type SoundMode, type ThemeId } from "../../shared/settings";
import { TRACKS, type Track } from "../../shared/types";
import { useActiveProfile } from "../profile/ProfileContext";

export { DAILY_GOAL, normalizeDailyGoal };

type SettingField = keyof PatchSettingsRequest;
type SaveTask = { pending: PatchSettingsRequest; optimistic: PatchSettingsRequest; latest: PatchSettingsRequest; revisions: Partial<Record<SettingField, number>>; running: boolean; error: string; waiters: Array<{ resolve: () => void; reject: (error: Error) => void }> };

export function createSettingsSaver(save: (profileId: number, patch: PatchSettingsRequest) => Promise<unknown>, saved: (profileId: number, patch: PatchSettingsRequest) => void = () => undefined) {
  const tasks = new Map<number, SaveTask>();
  const listeners = new Set<(profileId: number) => void>();
  let version = 0;
  const notify = (profileId: number) => listeners.forEach((listener) => listener(profileId));

  async function run(profileId: number, task: SaveTask) {
    if (task.running || Object.keys(task.pending).length === 0) return;
    task.running = true;
    task.error = "";
    notify(profileId);
    const current = task.pending;
    const currentRevisions = Object.fromEntries(Object.keys(current).map((field) => [field, task.revisions[field as SettingField]])) as Partial<Record<SettingField, number>>;
    task.pending = {};
    try {
      await save(profileId, current);
      for (const field of Object.keys(current) as SettingField[]) {
        if (task.revisions[field] === currentRevisions[field] && task.pending[field] === undefined) {
          delete task.optimistic[field];
        }
      }
      if (Object.keys(task.pending).length === 0) {
        task.waiters.splice(0).forEach(({ resolve }) => resolve());
        saved(profileId, current);
      }
    } catch (caught) {
      task.pending = { ...current, ...task.pending };
      task.error = caught instanceof Error ? caught.message : "설정을 저장하지 못했습니다.";
      task.waiters.splice(0).forEach(({ reject }) => reject(new Error(task.error)));
    } finally {
      task.running = false;
      if (!task.error && Object.keys(task.pending).length > 0) void run(profileId, task);
      notify(profileId);
    }
  }

  function update<K extends SettingField>(profileId: number, field: K, value: PatchSettingsRequest[K]) {
    const task = tasks.get(profileId) ?? { pending: {}, optimistic: {}, latest: {}, revisions: {}, running: false, error: "", waiters: [] };
    task.pending = { ...task.pending, [field]: value };
    task.optimistic = { ...task.optimistic, [field]: value };
    task.latest = { ...task.latest, [field]: value };
    task.revisions[field] = ++version;
    task.error = "";
    tasks.set(profileId, task);
    void run(profileId, task);
    notify(profileId);
  }

  function retry(profileId: number) {
    const task = tasks.get(profileId);
    if (task?.error) void run(profileId, task);
  }

  async function flush(profileId: number) {
    retry(profileId);
    const task = tasks.get(profileId);
    if (!task || !task.running && Object.keys(task.pending).length === 0) return;
    await new Promise<void>((resolve, reject) => task.waiters.push({ resolve, reject }));
  }

  return {
    update,
    retry,
    flush,
    subscribe: (listener: (profileId: number) => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    status: (profileId: number) => {
      const task = tasks.get(profileId);
      return { saving: task?.running ?? false, error: task?.error ?? "" };
    },
    snapshot: (profileId: number) => ({ revision: version, optimistic: { ...tasks.get(profileId)?.optimistic } }),
    optimisticSince: (profileId: number, revision: number) => {
      const task = tasks.get(profileId);
      if (!task) return {};
      return Object.fromEntries(Object.entries(task.latest).filter(([field]) => (task.revisions[field as SettingField] ?? 0) > revision)) as PatchSettingsRequest;
    },
  };
}

const settingsSaver = createSettingsSaver(
  (profileId, patch) => isApiProfileId(profileId)
    ? apiClient.patchSettings(patch, profileId, false)
    : Promise.reject(new Error("프로필이 바뀌어 설정을 저장하지 못했습니다.")),
  (profileId, patch) => {
    if (!isApiProfileId(profileId)) return;
    window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT, { detail: patch }));
    window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
  },
);
let timezoneSent = false;

export function resetSettingsClientState() { timezoneSent = false; }

export function toggleTrack(enabledTracks: Track[], track: Track): Track[] {
  if (!enabledTracks.includes(track)) return [...enabledTracks, track];
  return enabledTracks.length === 1 ? enabledTracks : enabledTracks.filter((candidate) => candidate !== track);
}

export function useSettings() {
  const { id: profileId } = useActiveProfile();
  const [enabledTracks, setEnabledTracks] = useState<Track[]>([...TRACKS]);
  const [dailyGoal, setDailyGoal] = useState(DEFAULT_DAILY_GOAL);
  const [onyomiScript, setOnyomiScript] = useState<OnyomiScript>("katakana");
  const [soundMode, setSoundMode] = useState<SoundMode>(DEFAULT_SOUND_MODE);
  const [theme, setTheme] = useState<ThemeId>("quiet-technical");
  const [isAdmin, setIsAdmin] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [, renderSaveStatus] = useState(0);

  useEffect(() => settingsSaver.subscribe((changedProfileId) => {
    if (changedProfileId === profileId) renderSaveStatus((value) => value + 1);
  }), [profileId]);

  useEffect(() => {
    const controller = new AbortController();
    const load = settingsSaver.snapshot(profileId);
    apiClient.settings(controller.signal).then((response) => {
      if (controller.signal.aborted) return;
      const settings = { ...response, ...load.optimistic, ...settingsSaver.optimisticSince(profileId, load.revision) } as SettingsResponse;
      setEnabledTracks(settings.enabledTracks);
      setDailyGoal(settings.dailyGoal);
      setOnyomiScript(settings.onyomiScript);
      setSoundMode(settings.soundMode);
      setTheme(settings.theme);
      setIsAdmin(settings.isAdmin);
      setError("");
      setReady(true);
      const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!timezoneSent && settings.timezone !== detectedTimezone) {
        timezoneSent = true;
        settingsSaver.update(profileId, "timezone", detectedTimezone);
      }
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) {
        setError(caught instanceof Error ? caught.message : "설정을 불러오지 못했습니다.");
        setReady(true);
      }
    });
    return () => controller.abort();
  }, [profileId, retryKey]);

  function persist<K extends SettingField>(field: K, value: PatchSettingsRequest[K]) { settingsSaver.update(profileId, field, value); }
  const saveStatus = settingsSaver.status(profileId);
  return {
    enabledTracks, dailyGoal, onyomiScript, soundMode, theme, isAdmin, error,
    saveError: saveStatus.error, saving: saveStatus.saving, ready,
    retry: () => setRetryKey((value) => value + 1),
    retrySave: () => settingsSaver.retry(profileId),
    flush: () => settingsSaver.flush(profileId),
    toggle: (track: Track) => { const value = toggleTrack(enabledTracks, track); setEnabledTracks(value); persist("enabledTracks", value); },
    setGoal: (goal: number) => { const value = normalizeDailyGoal(goal); setDailyGoal(value); persist("dailyGoal", value); },
    setOnyomiScript: (value: OnyomiScript) => { setOnyomiScript(value); persist("onyomiScript", value); },
    setSoundMode: (value: SoundMode) => { setSoundMode(value); persist("soundMode", value); },
    setTheme: (value: ThemeId) => {
      setTheme(value);
      window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT, { detail: { theme: value } }));
      persist("theme", value);
    },
  };
}
