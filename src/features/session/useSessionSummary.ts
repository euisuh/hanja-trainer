import { useEffect, useState } from "react";
import { useActiveProfile } from "../profile/ProfileContext";
import { ApiClientError, PIN_REQUIRED_EVENT, apiClient, isAuthenticationError, isPermanentApiError, retryDelayMs } from "../../lib/apiClient";
import type { CreateSessionRequest } from "../../shared/api";
import { parseSessionRequest } from "../../shared/session";
import { decodeEntryKey, removeEntries, removeEntry, storeEntry, storeEntryIfAbsent, storedEntries } from "./outboxStorage";

export type KeyedSessionSummary = CreateSessionRequest & { sessionId: string };
type PendingSummary = { profileId: number; input: KeyedSessionSummary };
type RejectedSummary = { profileId: number | null; raw: unknown; errorCode: string };
type StoredState = { version: 1; pending: PendingSummary[]; rejected: RejectedSummary[] };
export type SessionSummaryStatus = { pendingCount: number; rejectedCount: number; failed: boolean; pendingFailed: boolean; errorCode: string | null };

const STORAGE_KEY = "hanja-trainer:pending-session-summaries";
const ENTRY_PREFIX = `${STORAGE_KEY}:entry:`;
const REJECTED_PREFIX = `${STORAGE_KEY}:rejected:`;
const pending = new Map<string, PendingSummary>();
const rejected: RejectedSummary[] = [];
const suppressedPending = new Set<string>();
const inFlightKeys = new Set<string>();
const peerAcknowledgedKeys = new Set<string>();
const listeners = new Set<() => void>();
const flushing = new Set<number>();
const retryTimers = new Map<number, number>();
const retryAttempts = new Map<number, number>();
const authPaused = new Set<number>();
const failedProfiles = new Set<number>();
const lastErrors = new Map<number, string>();
let activeProfileId: number | null = null;

function keyOf(profileId: number, sessionId: string): string {
  return `${profileId}:${sessionId}`;
}

function restoreSummary(value: unknown, persist = false, storageKey?: string): boolean {
  const row = typeof value === "object" && value !== null && !Array.isArray(value) ? value as { profileId?: unknown; input?: unknown } : null;
  const profileId = Number.isSafeInteger(row?.profileId) && (row!.profileId as number) > 0 ? row!.profileId as number : null;
  const input = parseSessionRequest(row?.input);
  if (profileId !== null && input?.sessionId) {
    if (!pending.has(keyOf(profileId, input.sessionId))) pending.set(keyOf(profileId, input.sessionId), { profileId, input: input as KeyedSessionSummary });
    const key = keyOf(profileId, input.sessionId);
    return !persist || storeEntryIfAbsent(ENTRY_PREFIX, encodeURIComponent(key), { profileId, input: input as KeyedSessionSummary });
  }
  const item = { profileId, raw: value, errorCode: "invalid_stored_summary" };
  if (!persist) {
    addRejected(item);
    return false;
  }
  return addRejected(item, true, storageKey);
}

function persistPending(key: string, item: PendingSummary) {
  return storeEntry(ENTRY_PREFIX, encodeURIComponent(key), item);
}

function persistRejected(item: RejectedSummary, key: string = crypto.randomUUID()) {
  return storeEntry(REJECTED_PREFIX, key, item);
}

function addRejected(item: RejectedSummary, persist = false, storageKey?: string): boolean {
  if (!rejected.some((existing) => JSON.stringify(existing) === JSON.stringify(item))) rejected.push(item);
  return !persist || persistRejected(item, storageKey);
}

function quarantineStoredSummary(raw: unknown, storageKey: string): boolean {
  const row = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw as { profileId?: unknown } : null;
  const profileId = Number.isSafeInteger(row?.profileId) && (row!.profileId as number) > 0 ? row!.profileId as number : null;
  return addRejected({ profileId, raw, errorCode: "invalid_stored_summary" }, true, storageKey);
}

function rehydrate() {
  let stored: string | null;
  try {
    if (typeof localStorage === "undefined") return;
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  for (const [key, raw] of storedEntries(ENTRY_PREFIX)) {
    if (!restoreSummary(raw) && quarantineStoredSummary(raw, `corrupt-${key}`)) {
      removeEntry(ENTRY_PREFIX, key);
    }
  }
  for (const [, raw] of storedEntries(REJECTED_PREFIX)) restoreRejected(raw);
  if (stored === null) return;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      if (parsed.map((item, index) => restoreSummary(item, true, `legacy-p-${index}`)).every(Boolean)) localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const state = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Partial<StoredState> : null;
    if (state?.version !== 1 || !Array.isArray(state.pending) || !Array.isArray(state.rejected)) {
      if (addRejected({ profileId: null, raw: parsed, errorCode: "invalid_stored_queue" }, true, "legacy-invalid")) localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const migratedPending = state.pending.map((item, index) => restoreSummary(item, true, `legacy-p-${index}`)).every(Boolean);
    const migratedRejected = state.rejected.map((item, index) => restoreRejected(item, true, `legacy-r-${index}`)).every(Boolean);
    if (migratedPending && migratedRejected) localStorage.removeItem(STORAGE_KEY);
  } catch {
    if (addRejected({ profileId: null, raw: stored, errorCode: "invalid_stored_json" }, true, "legacy-invalid")) {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* Preserve the in-memory quarantine when storage is blocked. */ }
    }
  }
}

function restoreRejected(value: unknown, persist = false, storageKey?: string): boolean {
  const row = value as Partial<RejectedSummary> | null;
  const item: RejectedSummary = row && (row.profileId === null || Number.isSafeInteger(row.profileId) && row.profileId! > 0) && typeof row.errorCode === "string" && "raw" in row
    ? row as RejectedSummary : { profileId: null, raw: value, errorCode: "invalid_stored_rejection" };
  return addRejected(item, persist, storageKey);
}

rehydrate();

function notify() {
  for (const listener of listeners) listener();
}

function refreshPending() {
  for (const [key, raw] of storedEntries(ENTRY_PREFIX)) {
    if (suppressedPending.has(decodeEntryKey(key))) continue;
    if (!restoreSummary(raw) && quarantineStoredSummary(raw, `corrupt-${key}`)) {
      removeEntry(ENTRY_PREFIX, key);
    }
  }
}

function refreshRejected() {
  for (const [, raw] of storedEntries(REJECTED_PREFIX)) restoreRejected(raw);
}

function online(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

function clearRetry(profileId: number) {
  const timer = retryTimers.get(profileId);
  if (timer !== undefined) globalThis.clearTimeout(timer);
  retryTimers.delete(profileId);
}

function scheduleRetry(profileId: number, error: unknown) {
  if (activeProfileId !== profileId || retryTimers.has(profileId)) return;
  const attempt = retryAttempts.get(profileId) ?? 0;
  const delay = retryDelayMs(error, attempt);
  if (delay === null) return;
  retryAttempts.set(profileId, attempt + 1);
  retryTimers.set(profileId, globalThis.setTimeout(() => {
    retryTimers.delete(profileId);
    void flushPendingSummaries(profileId);
  }, delay) as unknown as number);
}

function nextFor(profileId: number): [string, PendingSummary] | undefined {
  refreshPending();
  return [...pending.entries()].find(([, item]) => item.profileId === profileId);
}

export async function flushPendingSummaries(profileId = activeProfileId): Promise<void> {
  if (profileId === null || activeProfileId !== profileId || flushing.has(profileId) || retryTimers.has(profileId) || authPaused.has(profileId) || !online()) return;
  if (!nextFor(profileId)) return;
  flushing.add(profileId);
  try {
    let entry = nextFor(profileId);
    while (entry && activeProfileId === profileId && online()) {
      const [key, item] = entry;
      inFlightKeys.add(key);
      try {
        await apiClient.createSession(profileId, item.input);
        if (pending.get(key) === item) {
          pending.delete(key);
          suppressedPending.delete(key);
          removeEntry(ENTRY_PREFIX, encodeURIComponent(key));
        }
      } catch (error) {
        if (!isPermanentApiError(error)) throw error;
        if (pending.get(key) === item) {
          pending.delete(key);
          const rejectedItem = { profileId, raw: item, errorCode: error.code };
          if (addRejected(rejectedItem, true)) removeEntry(ENTRY_PREFIX, encodeURIComponent(key));
          else suppressedPending.add(key);
        }
      } finally {
        inFlightKeys.delete(key);
        if (peerAcknowledgedKeys.delete(key)) pending.delete(key);
      }
      retryAttempts.delete(profileId);
      failedProfiles.delete(profileId);
      lastErrors.delete(profileId);
      notify();
      entry = nextFor(profileId);
    }
  } catch (error) {
    if (!nextFor(profileId)) {
      failedProfiles.delete(profileId);
      lastErrors.delete(profileId);
      retryAttempts.delete(profileId);
      return;
    }
    failedProfiles.add(profileId);
    lastErrors.set(profileId, error instanceof ApiClientError ? error.code : "network_error");
    if (isAuthenticationError(error)) {
      authPaused.add(profileId);
      if (activeProfileId === profileId) window.dispatchEvent(new Event(PIN_REQUIRED_EVENT));
    }
    else scheduleRetry(profileId, error);
  } finally {
    flushing.delete(profileId);
    notify();
  }
}

export function enqueuePendingSummary(profileId: number, input: KeyedSessionSummary) {
  refreshPending();
  const key = keyOf(profileId, input.sessionId);
  suppressedPending.delete(key);
  pending.set(key, { profileId, input });
  persistPending(key, { profileId, input });
  notify();
  if (profileId === activeProfileId && !retryTimers.has(profileId) && !authPaused.has(profileId)) void flushPendingSummaries(profileId);
}

export function retryPendingSummaries(profileId: number) {
  if (authPaused.has(profileId)) return;
  clearRetry(profileId);
  void flushPendingSummaries(profileId);
}

export function setSessionSummaryProfile(profileId: number | null) {
  for (const queuedProfileId of retryTimers.keys()) {
    if (queuedProfileId !== profileId) clearRetry(queuedProfileId);
  }
  activeProfileId = profileId;
  if (profileId !== null) authPaused.delete(profileId);
  notify();
  if (profileId !== null) void flushPendingSummaries(profileId);
}

export function pendingSummaryCount(profileId: number): number {
  refreshPending();
  return [...pending.values()].filter((item) => item.profileId === profileId).length;
}

export function exportRejectedSummaries(profileId: number): string {
  refreshRejected();
  return JSON.stringify(rejected.filter((item) => item.profileId === null || item.profileId === profileId), null, 2);
}

export function discardRejectedSummaries(profileId: number) {
  refreshRejected();
  for (let index = rejected.length - 1; index >= 0; index -= 1) {
    if (rejected[index].profileId === null || rejected[index].profileId === profileId) rejected.splice(index, 1);
  }
  for (const [key, raw] of storedEntries(REJECTED_PREFIX)) {
    const row = typeof raw === "object" && raw !== null ? raw as Partial<RejectedSummary> : null;
    if (!row || row.profileId === null || row.profileId === profileId) removeEntry(REJECTED_PREFIX, key);
  }
  for (const [storageKey, raw] of storedEntries(ENTRY_PREFIX)) {
    const key = decodeEntryKey(storageKey);
    const row = typeof raw === "object" && raw !== null ? raw as Partial<PendingSummary> : null;
    if (suppressedPending.has(key) && row?.profileId === profileId) {
      removeEntry(ENTRY_PREFIX, storageKey);
      suppressedPending.delete(key);
    }
  }
  notify();
}

export function sessionSummaryStatus(profileId: number): SessionSummaryStatus {
  refreshRejected();
  const visibleRejected = rejected.filter((item) => item.profileId === null || item.profileId === profileId);
  const rejectedCount = visibleRejected.length;
  const pendingFailed = failedProfiles.has(profileId);
  return { pendingCount: pendingSummaryCount(profileId), rejectedCount, failed: pendingFailed || rejectedCount > 0, pendingFailed, errorCode: lastErrors.get(profileId) ?? visibleRejected[0]?.errorCode ?? null };
}

export function resetSessionSummaryForTests() {
  for (const profileId of retryTimers.keys()) clearRetry(profileId);
  pending.clear();
  suppressedPending.clear();
  inFlightKeys.clear();
  peerAcknowledgedKeys.clear();
  rejected.splice(0);
  removeEntries(ENTRY_PREFIX);
  removeEntries(REJECTED_PREFIX);
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* test cleanup */ }
  listeners.clear();
  flushing.clear();
  retryAttempts.clear();
  authPaused.clear();
  failedProfiles.clear();
  lastErrors.clear();
  activeProfileId = null;
}

export function syncSummaryStorageEvent(event: Pick<StorageEvent, "key" | "newValue" | "oldValue">) {
  if (!event.key?.startsWith(STORAGE_KEY)) return;
  if (event.newValue === null && event.key.startsWith(ENTRY_PREFIX)) {
    const key = decodeEntryKey(event.key.slice(ENTRY_PREFIX.length));
    if (inFlightKeys.has(key)) peerAcknowledgedKeys.add(key);
    else pending.delete(key);
  }
  if (event.newValue === null && event.oldValue && event.key.startsWith(REJECTED_PREFIX)) {
    const index = rejected.findIndex((item) => JSON.stringify(item) === event.oldValue);
    if (index >= 0) rejected.splice(index, 1);
  }
  notify();
}

export function useSessionSummaryStatus() {
  const { id: profileId } = useActiveProfile();
  const [status, setStatus] = useState(() => sessionSummaryStatus(profileId));
  useEffect(() => {
    const update = () => setStatus(sessionSummaryStatus(profileId));
    const handleOnline = () => void flushPendingSummaries(profileId);
    const handleStorage = (event: StorageEvent) => {
      if (event.key?.startsWith(STORAGE_KEY)) {
        syncSummaryStorageEvent(event);
        void flushPendingSummaries(profileId);
      }
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
  }, [profileId]);
  return { ...status, retry: () => retryPendingSummaries(profileId) };
}
