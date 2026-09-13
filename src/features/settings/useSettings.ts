import { useEffect, useState } from "react";
import { PROFILE_UPDATED_EVENT, SETTINGS_UPDATED_EVENT, apiClient, isApiProfileId } from "../../lib/apiClient";
import type { PatchSettingsRequest, SettingsResponse } from "../../../shared/api";
import { DAILY_GOAL, DEFAULT_DAILY_GOAL, DEFAULT_SOUND_MODE, normalizeDailyGoal, normalizeSettingsPatch, type OnyomiScript, type SoundMode, type ThemeId } from "../../../shared/settings";
import { TRACKS, type Track } from "../../../shared/types";
import { useActiveProfile } from "../profile/ProfileContext";

export { DAILY_GOAL, normalizeDailyGoal };

type SettingField = keyof PatchSettingsRequest;
type SaveTask = { pending: PatchSettingsRequest; optimistic: PatchSettingsRequest; latest: PatchSettingsRequest; revisions: Partial<Record<SettingField, number>>; storageRevisions: Partial<Record<SettingField, string>>; running: boolean; error: string; waiters: Array<{ resolve: () => void; reject: (error: Error) => void }> };
type StoredField = { revision: string; value: unknown };
type StoredPatch = { version: 1; fields: Partial<Record<SettingField, StoredField>> };
type SettingsStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const PENDING_SETTINGS_KEY = "hanja-trainer:pending-settings";

function defaultStorage(): SettingsStorage | undefined {
  try { return typeof localStorage === "undefined" ? undefined : localStorage; } catch { return undefined; }
}

export function createSettingsSaver(save: (profileId: number, patch: PatchSettingsRequest) => Promise<unknown>, saved: (profileId: number, patch: PatchSettingsRequest) => void = () => undefined, storage = defaultStorage()) {
  const tasks = new Map<number, SaveTask>();
  const listeners = new Set<(profileId: number) => void>();
  let version = 0;
  const notify = (profileId: number) => listeners.forEach((listener) => listener(profileId));
  const storageKey = (profileId: number) => `${PENDING_SETTINGS_KEY}:${profileId}`;

  function readStored(profileId: number): StoredPatch | null {
    if (!storage) return null;
    try {
      const parsed: unknown = JSON.parse(storage.getItem(storageKey(profileId)) ?? "null");
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || (parsed as StoredPatch).version !== 1) return null;
      const fields = (parsed as StoredPatch).fields;
      if (typeof fields !== "object" || fields === null || Array.isArray(fields)) return null;
      const patch = Object.fromEntries(Object.entries(fields).map(([field, entry]) => [field, entry?.value]));
      const normalized = normalizeSettingsPatch(patch);
      if (!normalized || Object.keys(normalized).length !== Object.keys(fields).length) return null;
      for (const [field, entry] of Object.entries(fields)) {
        if (!entry || typeof entry !== "object" || typeof entry.revision !== "string" || !(field in normalized)) return null;
      }
      return {
        version: 1,
        fields: Object.fromEntries(Object.entries(fields).map(([field, entry]) => [field, { revision: entry.revision, value: normalized[field as SettingField] }])),
      };
    } catch { return null; }
  }

  function writeStored(profileId: number, field: SettingField, value: unknown, revision: string) {
    if (!storage) return;
    try {
      const fields = readStored(profileId)?.fields ?? {};
      storage.setItem(storageKey(profileId), JSON.stringify({ version: 1, fields: { ...fields, [field]: { revision, value } } } satisfies StoredPatch));
    } catch { /* In-memory retry remains available when browser storage is unavailable. */ }
  }

  function taskFor(profileId: number): SaveTask {
    const existing = tasks.get(profileId);
    if (existing) return existing;
    const stored = readStored(profileId);
    const pending: PatchSettingsRequest = {};
    const revisions: Partial<Record<SettingField, number>> = {};
    const storageRevisions: Partial<Record<SettingField, string>> = {};
    if (stored) for (const [field, entry] of Object.entries(stored.fields) as Array<[SettingField, StoredField]>) {
      pending[field] = entry.value as never;
      revisions[field] = ++version;
      storageRevisions[field] = entry.revision;
    }
    const task: SaveTask = { pending, optimistic: { ...pending }, latest: { ...pending }, revisions, storageRevisions, running: false, error: stored ? "저장되지 않은 설정이 있습니다." : "", waiters: [] };
    tasks.set(profileId, task);
    return task;
  }

  async function run(profileId: number, task: SaveTask) {
    if (task.running || Object.keys(task.pending).length === 0) return;
    task.running = true;
    task.error = "";
    notify(profileId);
    const current = task.pending;
    const currentRevisions = Object.fromEntries(Object.keys(current).map((field) => [field, task.revisions[field as SettingField]])) as Partial<Record<SettingField, number>>;
    const currentStorageRevisions = Object.fromEntries(Object.keys(current).map((field) => [field, task.storageRevisions[field as SettingField]])) as Partial<Record<SettingField, string>>;
    task.pending = {};
    try {
      await save(profileId, current);
      for (const field of Object.keys(current) as SettingField[]) {
        if (task.revisions[field] === currentRevisions[field] && task.pending[field] === undefined) {
          delete task.optimistic[field];
        }
      }
      const stored = readStored(profileId);
      if (stored) {
        for (const field of Object.keys(current) as SettingField[]) {
          if (stored.fields[field]?.revision === currentStorageRevisions[field]) delete stored.fields[field];
        }
        try {
          if (Object.keys(stored.fields).length === 0) storage?.removeItem(storageKey(profileId));
          else storage?.setItem(storageKey(profileId), JSON.stringify(stored));
        } catch { /* A later reload may safely retry the same field-only patch. */ }
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
    const task = taskFor(profileId);
    task.pending = { ...task.pending, [field]: value };
    task.optimistic = { ...task.optimistic, [field]: value };
    task.latest = { ...task.latest, [field]: value };
    task.revisions[field] = ++version;
    const storageRevision = crypto.randomUUID();
    task.storageRevisions[field] = storageRevision;
    task.error = "";
    tasks.set(profileId, task);
    writeStored(profileId, field, value, storageRevision);
    void run(profileId, task);
    notify(profileId);
  }

  function retry(profileId: number) {
    const task = taskFor(profileId);
    if (task?.error) void run(profileId, task);
  }

  async function flush(profileId: number) {
    retry(profileId);
    const task = taskFor(profileId);
    if (!task || !task.running && Object.keys(task.pending).length === 0) return;
    await new Promise<void>((resolve, reject) => task.waiters.push({ resolve, reject }));
  }

  return {
    update,
    retry,
    flush,
    subscribe: (listener: (profileId: number) => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    status: (profileId: number) => {
      const task = taskFor(profileId);
      return { saving: task?.running ?? false, error: task?.error ?? "" };
    },
    snapshot: (profileId: number) => ({ revision: version, optimistic: { ...taskFor(profileId).optimistic } }),
    optimisticSince: (profileId: number, revision: number) => {
      const task = taskFor(profileId);
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
