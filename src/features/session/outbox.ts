import { useEffect, useState } from "react";
import { ApiClientError, PIN_REQUIRED_EVENT, isAuthenticationError, isPermanentApiError, retryDelayMs } from "../../lib/apiClient";
import { decodeEntryKey, removeEntries, removeEntry, storeEntry, storeEntryIfAbsent, storedEntries } from "./outboxStorage";

type Pending<Input, Result> = { profileId: number; input: Input; onSynced?: (result: Result) => void };
type Entry<Input, Result> = [string, Pending<Input, Result>];
export type RejectedEntry = { profileId: number | null; raw: unknown; errorCode: string };
export type OutboxStatus = { pendingCount: number; rejectedCount: number; failed: boolean; pendingFailed: boolean; errorCode: string | null };

type OutboxConfig<Input, Result> = {
  storageKey: string;
  keyOf: (profileId: number, input: Input) => string;
  parse: (raw: unknown) => Input | null;
  invalidStoredCode: string;
  batchSize: number;
  // Resolves with one result per input, or throws ApiClientError (invalid_response for a malformed body).
  send: (profileId: number, inputs: Input[]) => Promise<Result[]>;
  maxPending?: number;
  sessionOf?: (input: Input) => string;
  // Reviews keep the profile marked failed after a permanent rejection; summaries report
  // rejections only through the rejected list so `pendingFailed` stays about pending work.
  rejectionMarksFailure: boolean;
};

function validProfileId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function objectRow(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
}

// Stored rejected rows are normalized on load; storage events must normalize the
// removed value the same way or a peer tab's discard could never match it.
function normalizeRejected(raw: unknown): RejectedEntry {
  const row = objectRow(raw);
  return row && (row.profileId === null || validProfileId(row.profileId)) && typeof row.errorCode === "string" && row.errorCode.length > 0 && "raw" in row
    ? { profileId: row.profileId as number | null, raw: row.raw, errorCode: row.errorCode }
    : { profileId: null, raw, errorCode: "invalid_stored_rejection" };
}

// Tests stub `window` partially; browsers share one timer implementation either way.
function timers(): Pick<typeof globalThis, "setTimeout" | "clearTimeout"> {
  return typeof window !== "undefined" && typeof window.setTimeout === "function" ? window : globalThis;
}

// Durable per-profile outbox shared by review answers and session summaries: entries are
// persisted one key each, rehydrated at load, flushed in batches with permanent failures
// quarantined individually, retried with backoff, paused on authentication errors, and
// reconciled across tabs through storage events.
export function createOutbox<Input, Result>(config: OutboxConfig<Input, Result>) {
  const { storageKey } = config;
  const entryPrefix = `${storageKey}:entry:`;
  const rejectedPrefix = `${storageKey}:rejected:`;
  const pending = new Map<string, Pending<Input, Result>>();
  const rejected: RejectedEntry[] = [];
  const suppressedPending = new Set<string>();
  const inFlightKeys = new Set<string>();
  const peerAcknowledgedKeys = new Set<string>();
  const listeners = new Set<() => void>();
  const flushing = new Set<number>();
  const retryTimers = new Map<number, ReturnType<typeof setTimeout>>();
  const retryAttempts = new Map<number, number>();
  const failedProfiles = new Set<number>();
  const authPaused = new Set<number>();
  const lastErrors = new Map<number, string>();
  let activeProfileId: number | null = null;

  const visibleRejected = (profileId: number) => rejected.filter((item) => item.profileId === null || item.profileId === profileId);
  const persistPending = (key: string, item: Pending<Input, Result>) => storeEntry(entryPrefix, encodeURIComponent(key), { profileId: item.profileId, input: item.input });

  function addRejected(item: RejectedEntry, persist = false, key?: string): boolean {
    if (!rejected.some((existing) => JSON.stringify(existing) === JSON.stringify(item))) rejected.push(item);
    return !persist || storeEntry(rejectedPrefix, key ?? crypto.randomUUID(), item);
  }

  function quarantineStored(raw: unknown, key: string): boolean {
    const row = objectRow(raw);
    return addRejected({ profileId: validProfileId(row?.profileId) ? row.profileId : null, raw, errorCode: config.invalidStoredCode }, true, key);
  }

  function restorePending(raw: unknown, persist = false, key?: string): boolean {
    const row = objectRow(raw);
    const profileId = row?.profileId;
    const input = config.parse(row?.input);
    if (validProfileId(profileId) && input) {
      const pendingKey = config.keyOf(profileId, input);
      if (!pending.has(pendingKey)) pending.set(pendingKey, { profileId, input });
      return !persist || storeEntryIfAbsent(entryPrefix, encodeURIComponent(pendingKey), { profileId, input });
    }
    const item = { profileId: validProfileId(profileId) ? profileId : null, raw, errorCode: config.invalidStoredCode };
    if (!persist) {
      addRejected(item);
      return false;
    }
    return addRejected(item, true, key);
  }

  function restoreRejected(raw: unknown, persist = false, key?: string): boolean {
    return addRejected(normalizeRejected(raw), persist, key);
  }

  function refreshPending() {
    for (const [key, raw] of storedEntries(entryPrefix)) {
      if (suppressedPending.has(decodeEntryKey(key))) continue;
      if (!restorePending(raw) && quarantineStored(raw, `corrupt-${key}`)) removeEntry(entryPrefix, key);
    }
  }

  function refreshRejected() {
    for (const [, raw] of storedEntries(rejectedPrefix)) restoreRejected(raw);
  }

  function rehydrate() {
    let stored: string | null;
    try {
      if (typeof localStorage === "undefined") return;
      stored = localStorage.getItem(storageKey);
    } catch {
      return;
    }
    refreshPending();
    refreshRejected();
    if (stored === null) return;
    // Pre-per-entry storage: a whole-queue JSON value under the bare key.
    try {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        if (parsed.map((item, index) => restorePending(item, true, `legacy-p-${index}`)).every(Boolean)) localStorage.removeItem(storageKey);
        return;
      }
      const state = objectRow(parsed);
      if (state?.version === 1 && Array.isArray(state.pending) && Array.isArray(state.rejected)) {
        const migratedPending = state.pending.map((item, index) => restorePending(item, true, `legacy-p-${index}`)).every(Boolean);
        const migratedRejected = state.rejected.map((item, index) => restoreRejected(item, true, `legacy-r-${index}`)).every(Boolean);
        if (migratedPending && migratedRejected) localStorage.removeItem(storageKey);
        return;
      }
      if (addRejected({ profileId: null, raw: parsed, errorCode: "invalid_stored_queue" }, true, "legacy-invalid")) localStorage.removeItem(storageKey);
    } catch {
      if (addRejected({ profileId: null, raw: stored, errorCode: "invalid_stored_json" }, true, "legacy-invalid")) {
        try { localStorage.removeItem(storageKey); } catch { /* Preserve the in-memory quarantine when storage is blocked. */ }
      }
    }
  }

  rehydrate();

  const notify = () => { for (const listener of listeners) listener(); };
  const online = () => typeof navigator === "undefined" || navigator.onLine;

  function clearRetry(profileId: number) {
    const timer = retryTimers.get(profileId);
    if (timer !== undefined) timers().clearTimeout(timer);
    retryTimers.delete(profileId);
  }

  function scheduleRetry(profileId: number, error: unknown) {
    if (activeProfileId !== profileId || retryTimers.has(profileId)) return;
    const attempt = retryAttempts.get(profileId) ?? 0;
    const delay = retryDelayMs(error, attempt);
    if (delay === null) return;
    retryAttempts.set(profileId, attempt + 1);
    retryTimers.set(profileId, timers().setTimeout(() => {
      retryTimers.delete(profileId);
      void flush(profileId);
    }, delay));
  }

  function entriesFor(profileId: number): Entry<Input, Result>[] {
    refreshPending();
    return [...pending.entries()].filter(([, item]) => item.profileId === profileId).slice(0, config.batchSize);
  }

  function clearFailure(profileId: number) {
    retryAttempts.delete(profileId);
    failedProfiles.delete(profileId);
    lastErrors.delete(profileId);
  }

  // A key another tab removed while this request was in flight is dropped here, before any
  // permanent-error quarantine: that tab already saved the entry, persisted its own rejection,
  // or (when its quarantine storage was full) the learner confirmed discarding it there.
  async function submitEntries(profileId: number, entries: Entry<Input, Result>[]) {
    entries.forEach(([key]) => inFlightKeys.add(key));
    try {
      const results = await config.send(profileId, entries.map(([, item]) => item.input));
      entries.forEach(([key, item], index) => {
        if (pending.get(key) !== item) return;
        pending.delete(key);
        suppressedPending.delete(key);
        removeEntry(entryPrefix, encodeURIComponent(key));
        try { item.onSynced?.(results[index]); } catch { /* A view callback cannot invalidate a server acknowledgement. */ }
      });
      clearFailure(profileId);
      notify();
    } finally {
      entries.forEach(([key]) => {
        inFlightKeys.delete(key);
        if (peerAcknowledgedKeys.delete(key)) pending.delete(key);
      });
    }
  }

  function rejectEntry([key, item]: Entry<Input, Result>, error: ApiClientError) {
    if (pending.get(key) === item) {
      pending.delete(key);
      if (addRejected({ profileId: item.profileId, raw: { profileId: item.profileId, input: item.input }, errorCode: error.code }, true)) removeEntry(entryPrefix, encodeURIComponent(key));
      else suppressedPending.add(key);
      if (config.rejectionMarksFailure) {
        failedProfiles.add(item.profileId);
        lastErrors.set(item.profileId, error.code);
      }
    }
    if (!config.rejectionMarksFailure) clearFailure(item.profileId);
    notify();
  }

  async function submitOrIsolate(profileId: number, entries: Entry<Input, Result>[]) {
    try {
      await submitEntries(profileId, entries);
    } catch (error) {
      if (!isPermanentApiError(error)) throw error;
      if (entries.length === 1) {
        rejectEntry(entries[0], error);
        return;
      }
      let temporaryError: unknown;
      for (const entry of entries) {
        if (activeProfileId !== profileId || !online()) break;
        try {
          await submitEntries(profileId, [entry]);
        } catch (individualError) {
          if (!isPermanentApiError(individualError)) {
            temporaryError ??= individualError;
            break;
          }
          rejectEntry(entry, individualError);
        }
      }
      if (temporaryError !== undefined) throw temporaryError;
    }
  }

  async function flush(profileId = activeProfileId): Promise<void> {
    if (profileId === null || activeProfileId !== profileId || flushing.has(profileId) || retryTimers.has(profileId) || authPaused.has(profileId) || !online()) return;
    let entries = entriesFor(profileId);
    if (entries.length === 0) return;
    flushing.add(profileId);
    try {
      while (entries.length > 0) {
        await submitOrIsolate(profileId, entries);
        if (activeProfileId !== profileId || !online()) break;
        entries = entriesFor(profileId);
      }
    } catch (error) {
      if (entriesFor(profileId).length === 0) {
        clearFailure(profileId);
        return;
      }
      failedProfiles.add(profileId);
      lastErrors.set(profileId, error instanceof ApiClientError ? error.code : "network_error");
      if (isAuthenticationError(error)) {
        authPaused.add(profileId);
        if (activeProfileId === profileId) window.dispatchEvent(new Event(PIN_REQUIRED_EVENT));
      } else {
        scheduleRetry(profileId, error);
      }
    } finally {
      flushing.delete(profileId);
      notify();
    }
  }

  function retry(profileId: number) {
    if (authPaused.has(profileId)) return;
    clearRetry(profileId);
    void flush(profileId);
  }

  function setProfile(profileId: number | null) {
    activeProfileId = profileId;
    for (const queuedProfileId of retryTimers.keys()) {
      if (queuedProfileId !== profileId) clearRetry(queuedProfileId);
    }
    if (profileId !== null) {
      clearRetry(profileId);
      retryAttempts.delete(profileId);
      authPaused.delete(profileId);
    }
    notify();
    if (profileId !== null) void flush(profileId);
  }

  function enqueue(profileId: number, input: Input, onSynced?: (result: Result) => void) {
    refreshPending();
    if (config.maxPending !== undefined && pending.size >= config.maxPending) {
      const oldest = pending.entries().next();
      if (!oldest.done) {
        const [oldestKey, oldestItem] = oldest.value;
        pending.delete(oldestKey);
        if (addRejected({ profileId: oldestItem.profileId, raw: { profileId: oldestItem.profileId, input: oldestItem.input }, errorCode: "queue_capacity" }, true)) removeEntry(entryPrefix, encodeURIComponent(oldestKey));
        else suppressedPending.add(oldestKey);
      }
    }
    const key = config.keyOf(profileId, input);
    const item = { profileId, input, onSynced };
    suppressedPending.delete(key);
    pending.set(key, item);
    persistPending(key, item);
    notify();
    if (profileId === activeProfileId && !retryTimers.has(profileId) && !authPaused.has(profileId)) void flush(profileId);
  }

  function pendingCount(profileId: number, sessionId?: string): number {
    refreshPending();
    return [...pending.values()].filter((item) => item.profileId === profileId && (!sessionId || config.sessionOf?.(item.input) === sessionId)).length;
  }

  function status(profileId: number, sessionId?: string): OutboxStatus {
    refreshRejected();
    const visible = visibleRejected(profileId);
    const pendingFailed = failedProfiles.has(profileId);
    return {
      pendingCount: pendingCount(profileId, sessionId),
      rejectedCount: visible.length,
      failed: pendingFailed || visible.length > 0,
      pendingFailed,
      errorCode: lastErrors.get(profileId) ?? visible[0]?.errorCode ?? null,
    };
  }

  function exportRejected(profileId: number): string {
    refreshRejected();
    return JSON.stringify(visibleRejected(profileId), null, 2);
  }

  function discardRejected(profileId: number) {
    refreshRejected();
    for (let index = rejected.length - 1; index >= 0; index -= 1) {
      if (rejected[index].profileId === null || rejected[index].profileId === profileId) rejected.splice(index, 1);
    }
    for (const [key, raw] of storedEntries(rejectedPrefix)) {
      const row = typeof raw === "object" && raw !== null ? raw as Partial<RejectedEntry> : null;
      if (!row || row.profileId === null || row.profileId === profileId) removeEntry(rejectedPrefix, key);
    }
    for (const [storedKey, raw] of storedEntries(entryPrefix)) {
      const key = decodeEntryKey(storedKey);
      const row = typeof raw === "object" && raw !== null ? raw as { profileId?: unknown } : null;
      if (suppressedPending.has(key) && row?.profileId === profileId) {
        removeEntry(entryPrefix, storedKey);
        suppressedPending.delete(key);
      }
    }
    if (visibleRejected(profileId).length === 0 && pendingCount(profileId) === 0) {
      failedProfiles.delete(profileId);
      lastErrors.delete(profileId);
    }
    notify();
  }

  function resetForTests() {
    for (const profileId of retryTimers.keys()) clearRetry(profileId);
    pending.clear();
    suppressedPending.clear();
    inFlightKeys.clear();
    peerAcknowledgedKeys.clear();
    rejected.splice(0);
    removeEntries(entryPrefix);
    removeEntries(rejectedPrefix);
    try { localStorage.removeItem(storageKey); } catch { /* test cleanup */ }
    listeners.clear();
    flushing.clear();
    retryAttempts.clear();
    authPaused.clear();
    failedProfiles.clear();
    lastErrors.clear();
    activeProfileId = null;
  }

  function syncStorageEvent(event: Pick<StorageEvent, "key" | "newValue" | "oldValue">) {
    if (!event.key?.startsWith(storageKey)) return;
    if (event.newValue === null && event.key.startsWith(entryPrefix)) {
      const key = decodeEntryKey(event.key.slice(entryPrefix.length));
      if (inFlightKeys.has(key)) peerAcknowledgedKeys.add(key);
      else pending.delete(key);
    }
    if (event.newValue === null && event.oldValue !== null && event.key.startsWith(rejectedPrefix)) {
      let removed: unknown;
      try { removed = JSON.parse(event.oldValue); } catch { removed = event.oldValue; }
      const match = JSON.stringify(normalizeRejected(removed));
      const index = rejected.findIndex((item) => JSON.stringify(item) === match);
      if (index >= 0) rejected.splice(index, 1);
    }
    notify();
  }

  function useStatus(profileId: number, sessionId?: string): OutboxStatus {
    const [current, setCurrent] = useState(() => status(profileId, sessionId));
    useEffect(() => {
      const update = () => setCurrent(status(profileId, sessionId));
      const handleOnline = () => void flush(profileId);
      const handleStorage = (event: StorageEvent) => {
        if (!event.key?.startsWith(storageKey)) return;
        syncStorageEvent(event);
        void flush(profileId);
      };
      listeners.add(update);
      window.addEventListener("online", handleOnline);
      window.addEventListener("storage", handleStorage);
      update();
      return () => {
        listeners.delete(update);
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("storage", handleStorage);
      };
    }, [profileId, sessionId]);
    return current;
  }

  return { flush, retry, setProfile, enqueue, pendingCount, status, exportRejected, discardRejected, resetForTests, syncStorageEvent, useStatus };
}
