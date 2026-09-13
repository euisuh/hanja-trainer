import { useCallback, useEffect, useState } from "react";
import { useActiveProfile } from "../profile/ProfileContext";
import { ApiClientError, PIN_REQUIRED_EVENT, apiClient, isAuthenticationError, isPermanentApiError, retryDelayMs } from "../../lib/apiClient";
import { MAX_REVIEW_BATCH_SIZE, type SubmitReviewRequest, type SubmitReviewResponse } from "../../../shared/api";
import { parseReviewRequest } from "../../../shared/review";
import { decodeEntryKey, removeEntries, removeEntry, storeEntry, storeEntryIfAbsent, storedEntries } from "./outboxStorage";

type PendingReview = { profileId: number; input: SubmitReviewRequest; onSynced?: (response: SubmitReviewResponse) => void };
export type RejectedReview = { profileId: number | null; raw: unknown; errorCode: string };
export type ReviewSyncStatus = { pendingCount: number; rejectedCount: number; failed: boolean; errorCode: string | null };
type QueueEntry = [string, PendingReview];

const pending = new Map<string, PendingReview>();
const rejected: RejectedReview[] = [];
const suppressedPending = new Set<string>();
const inFlightKeys = new Set<string>();
const peerAcknowledgedKeys = new Set<string>();
const STORAGE_KEY = "hanja-trainer:pending-reviews";
const ENTRY_PREFIX = `${STORAGE_KEY}:entry:`;
const REJECTED_PREFIX = `${STORAGE_KEY}:rejected:`;
const MAX_PENDING = 500;
const listeners = new Set<() => void>();
const flushing = new Set<number>();
const retryTimers = new Map<number, number>();
const retryAttempts = new Map<number, number>();
const failedProfiles = new Set<number>();
const authPausedProfiles = new Set<number>();
const lastErrors = new Map<number, string>();
let activeProfileId: number | null = null;

function keyOf(profileId: number, input: SubmitReviewRequest): string {
  return `${profileId}:${input.sessionId}:${input.cardIndex}`;
}

function validProfileId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function visibleRejected(profileId: number): RejectedReview[] {
  return rejected.filter((item) => item.profileId === null || item.profileId === profileId);
}

function persistPending(key: string, item: PendingReview) {
  return storeEntry(ENTRY_PREFIX, encodeURIComponent(key), { profileId: item.profileId, input: item.input });
}

function persistRejected(item: RejectedReview, key: string = crypto.randomUUID()) {
  return storeEntry(REJECTED_PREFIX, key, item);
}

function addRejected(item: RejectedReview, persist = false, storageKey?: string): boolean {
  if (!rejected.some((existing) => JSON.stringify(existing) === JSON.stringify(item))) rejected.push(item);
  return !persist || persistRejected(item, storageKey);
}

function quarantineStoredReview(raw: unknown, storageKey: string): boolean {
  const row = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  return addRejected({ profileId: validProfileId(row?.profileId) ? row.profileId : null, raw, errorCode: "invalid_stored_review" }, true, storageKey);
}

function restorePending(raw: unknown, persist = false, storageKey?: string): boolean {
  const row = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  const profileId = row?.profileId;
  const input = parseReviewRequest(row?.input);
  if (validProfileId(profileId) && input) {
    const key = keyOf(profileId, input);
    if (!pending.has(key)) pending.set(key, { profileId, input });
    return !persist || storeEntryIfAbsent(ENTRY_PREFIX, encodeURIComponent(key), { profileId, input });
  }
  const item = { profileId: validProfileId(profileId) ? profileId : null, raw, errorCode: "invalid_stored_review" };
  if (!persist) {
    addRejected(item);
    return false;
  }
  return addRejected(item, true, storageKey);
}

function restoreRejected(raw: unknown, persist = false, storageKey?: string): boolean {
  const row = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  if (row && (row.profileId === null || validProfileId(row.profileId)) && typeof row.errorCode === "string" && row.errorCode.length > 0 && "raw" in row) {
    const item = { profileId: row.profileId as number | null, raw: row.raw, errorCode: row.errorCode };
    return addRejected(item, persist, storageKey);
  } else {
    return addRejected({ profileId: null, raw, errorCode: "invalid_stored_rejection" }, persist, storageKey);
  }
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
    if (!restorePending(raw) && quarantineStoredReview(raw, `corrupt-${key}`)) {
      removeEntry(ENTRY_PREFIX, key);
    }
  }
  for (const [, raw] of storedEntries(REJECTED_PREFIX)) restoreRejected(raw);
  if (stored === null) return;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      if (parsed.map((item, index) => restorePending(item, true, `legacy-p-${index}`)).every(Boolean)) localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const state = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    if (state?.version === 1 && Array.isArray(state.pending) && Array.isArray(state.rejected)) {
      const migratedPending = state.pending.map((item, index) => restorePending(item, true, `legacy-p-${index}`)).every(Boolean);
      const migratedRejected = state.rejected.map((item, index) => restoreRejected(item, true, `legacy-r-${index}`)).every(Boolean);
      if (migratedPending && migratedRejected) localStorage.removeItem(STORAGE_KEY);
      return;
    }
    if (addRejected({ profileId: null, raw: parsed, errorCode: "invalid_stored_queue" }, true, "legacy-invalid")) localStorage.removeItem(STORAGE_KEY);
  } catch {
    if (addRejected({ profileId: null, raw: stored, errorCode: "invalid_stored_json" }, true, "legacy-invalid")) {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* Preserve the in-memory quarantine when storage is blocked. */ }
    }
  }
}

rehydrate();

function notify() {
  for (const listener of listeners) listener();
}

function refreshPending() {
  for (const [key, raw] of storedEntries(ENTRY_PREFIX)) {
    if (suppressedPending.has(decodeEntryKey(key))) continue;
    if (!restorePending(raw) && quarantineStoredReview(raw, `corrupt-${key}`)) {
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
  if (timer !== undefined) window.clearTimeout(timer);
  retryTimers.delete(profileId);
}

function scheduleRetry(profileId: number, error: unknown) {
  if (activeProfileId !== profileId || retryTimers.has(profileId)) return;
  const attempt = retryAttempts.get(profileId) ?? 0;
  const delay = retryDelayMs(error, attempt);
  if (delay === null) return;
  retryAttempts.set(profileId, attempt + 1);
  retryTimers.set(profileId, window.setTimeout(() => {
    retryTimers.delete(profileId);
    void flushPendingReviews(profileId);
  }, delay));
}

function entriesFor(profileId: number): QueueEntry[] {
  refreshPending();
  return [...pending.entries()].filter(([, item]) => item.profileId === profileId).slice(0, MAX_REVIEW_BATCH_SIZE);
}

function validReviewResponse(value: unknown): value is SubmitReviewResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return typeof result.due === "string" && Number.isFinite(Date.parse(result.due))
    && typeof result.scheduledDays === "number" && Number.isFinite(result.scheduledDays)
    && typeof result.stability === "number" && Number.isFinite(result.stability)
    && typeof result.difficulty === "number" && Number.isFinite(result.difficulty)
    && typeof result.dueLabel === "string";
}

function acknowledge(entries: QueueEntry[], response: unknown) {
  const results = typeof response === "object" && response !== null && "results" in response ? response.results : null;
  if (!Array.isArray(results) || results.length !== entries.length || !results.every(validReviewResponse)) {
    throw new ApiClientError(502, "invalid_response", "The server returned an incomplete review response.");
  }
  entries.forEach(([key, item], index) => {
    if (pending.get(key) !== item) return;
    pending.delete(key);
    suppressedPending.delete(key);
    removeEntry(ENTRY_PREFIX, encodeURIComponent(key));
    try { item.onSynced?.(results[index]); } catch { /* A view callback cannot invalidate a server acknowledgement. */ }
  });
}

async function submitEntries(profileId: number, entries: QueueEntry[]) {
  entries.forEach(([key]) => inFlightKeys.add(key));
  try {
    const response = await apiClient.submitReviews(profileId, entries.map(([, item]) => item.input));
    acknowledge(entries, response);
    retryAttempts.delete(profileId);
    failedProfiles.delete(profileId);
    lastErrors.delete(profileId);
    notify();
  } finally {
    entries.forEach(([key]) => {
      inFlightKeys.delete(key);
      if (peerAcknowledgedKeys.delete(key)) pending.delete(key);
    });
  }
}

function rejectEntry(entry: QueueEntry, error: ApiClientError) {
  const [key, item] = entry;
  if (pending.get(key) !== item) return;
  pending.delete(key);
  const rejectedItem = { profileId: item.profileId, raw: { profileId: item.profileId, input: item.input }, errorCode: error.code };
  if (addRejected(rejectedItem, true)) removeEntry(ENTRY_PREFIX, encodeURIComponent(key));
  else suppressedPending.add(key);
  failedProfiles.add(item.profileId);
  lastErrors.set(item.profileId, error.code);
}

async function submitOrIsolate(profileId: number, entries: QueueEntry[]) {
  try {
    await submitEntries(profileId, entries);
  } catch (error) {
    if (!isPermanentApiError(error)) throw error;
    if (entries.length === 1) {
      rejectEntry(entries[0], error);
      notify();
      return;
    }
    let temporaryError: unknown;
    for (const entry of entries) {
      if (activeProfileId !== profileId || !online()) break;
      try {
        await submitEntries(profileId, [entry]);
      } catch (individualError) {
        if (isPermanentApiError(individualError)) {
          rejectEntry(entry, individualError);
          notify();
        } else {
          temporaryError ??= individualError;
          break;
        }
      }
    }
    if (temporaryError !== undefined) throw temporaryError;
  }
}

export async function flushPendingReviews(profileId = activeProfileId): Promise<void> {
  if (profileId === null || activeProfileId !== profileId || flushing.has(profileId) || retryTimers.has(profileId) || authPausedProfiles.has(profileId) || !online()) return;
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
      failedProfiles.delete(profileId);
      lastErrors.delete(profileId);
      retryAttempts.delete(profileId);
      return;
    }
    failedProfiles.add(profileId);
    lastErrors.set(profileId, error instanceof ApiClientError ? error.code : "network_error");
    if (isAuthenticationError(error)) {
      authPausedProfiles.add(profileId);
      if (activeProfileId === profileId) window.dispatchEvent(new Event(PIN_REQUIRED_EVENT));
    } else {
      scheduleRetry(profileId, error);
    }
  } finally {
    flushing.delete(profileId);
    notify();
  }
}

export function retryPendingReviews(profileId: number) {
  if (authPausedProfiles.has(profileId)) return;
  clearRetry(profileId);
  void flushPendingReviews(profileId);
}

export function setAnswerSubmitProfile(profileId: number | null) {
  activeProfileId = profileId;
  for (const queuedProfileId of retryTimers.keys()) {
    if (queuedProfileId !== profileId) clearRetry(queuedProfileId);
  }
  if (profileId !== null) {
    clearRetry(profileId);
    retryAttempts.delete(profileId);
    authPausedProfiles.delete(profileId);
  }
  notify();
  if (profileId !== null) void flushPendingReviews(profileId);
}

export function enqueuePendingReview(profileId: number, input: SubmitReviewRequest, onSynced?: (response: SubmitReviewResponse) => void) {
  refreshPending();
  if (pending.size >= MAX_PENDING) {
    const oldest = pending.entries().next();
    if (!oldest.done) {
      pending.delete(oldest.value[0]);
      const rejectedItem = { profileId: oldest.value[1].profileId, raw: { profileId: oldest.value[1].profileId, input: oldest.value[1].input }, errorCode: "queue_capacity" };
      if (addRejected(rejectedItem, true)) removeEntry(ENTRY_PREFIX, encodeURIComponent(oldest.value[0]));
      else suppressedPending.add(oldest.value[0]);
    }
  }
  const key = keyOf(profileId, input);
  suppressedPending.delete(key);
  pending.set(key, { profileId, input, onSynced });
  persistPending(key, { profileId, input, onSynced });
  notify();
  if (profileId === activeProfileId && !retryTimers.has(profileId) && !authPausedProfiles.has(profileId)) void flushPendingReviews(profileId);
}

export function pendingReviewCount(profileId: number, sessionId?: string): number {
  refreshPending();
  return [...pending.values()].filter((item) => item.profileId === profileId && (!sessionId || item.input.sessionId === sessionId)).length;
}

export function reviewSyncStatus(profileId: number, sessionId?: string): ReviewSyncStatus {
  refreshRejected();
  const rejectedCount = visibleRejected(profileId).length;
  return {
    pendingCount: pendingReviewCount(profileId, sessionId),
    rejectedCount,
    failed: failedProfiles.has(profileId) || rejectedCount > 0,
    errorCode: lastErrors.get(profileId) ?? (rejectedCount > 0 ? visibleRejected(profileId)[0].errorCode : null),
  };
}

export function exportRejectedReviews(profileId: number): string {
  refreshRejected();
  return JSON.stringify(visibleRejected(profileId), null, 2);
}

export function discardRejectedReviews(profileId: number) {
  refreshRejected();
  for (let index = rejected.length - 1; index >= 0; index -= 1) {
    if (rejected[index].profileId === null || rejected[index].profileId === profileId) rejected.splice(index, 1);
  }
  for (const [key, raw] of storedEntries(REJECTED_PREFIX)) {
    const row = typeof raw === "object" && raw !== null ? raw as Partial<RejectedReview> : null;
    if (!row || row.profileId === null || row.profileId === profileId) removeEntry(REJECTED_PREFIX, key);
  }
  for (const [storageKey, raw] of storedEntries(ENTRY_PREFIX)) {
    const key = decodeEntryKey(storageKey);
    const row = typeof raw === "object" && raw !== null ? raw as Partial<PendingReview> : null;
    if (suppressedPending.has(key) && row?.profileId === profileId) {
      removeEntry(ENTRY_PREFIX, storageKey);
      suppressedPending.delete(key);
    }
  }
  if (visibleRejected(profileId).length === 0 && pendingReviewCount(profileId) === 0) {
    failedProfiles.delete(profileId);
    lastErrors.delete(profileId);
  }
  notify();
}

export function resetAnswerSubmitForTests() {
  for (const profileId of retryTimers.keys()) clearRetry(profileId);
  pending.clear();
  suppressedPending.clear();
  inFlightKeys.clear();
  peerAcknowledgedKeys.clear();
  rejected.splice(0);
  removeEntries(ENTRY_PREFIX);
  removeEntries(REJECTED_PREFIX);
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* test cleanup */ }
  flushing.clear();
  retryAttempts.clear();
  failedProfiles.clear();
  authPausedProfiles.clear();
  lastErrors.clear();
  activeProfileId = null;
  listeners.clear();
}

export function syncReviewStorageEvent(event: Pick<StorageEvent, "key" | "newValue" | "oldValue">) {
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

function useSyncStatus(profileId: number, sessionId?: string) {
  const [status, setStatus] = useState(() => reviewSyncStatus(profileId, sessionId));
  useEffect(() => {
    const update = () => setStatus(reviewSyncStatus(profileId, sessionId));
    const handleOnline = () => void flushPendingReviews(profileId);
    const handleStorage = (event: StorageEvent) => {
      if (event.key?.startsWith(STORAGE_KEY)) {
        syncReviewStorageEvent(event);
        void flushPendingReviews(profileId);
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
  }, [profileId, sessionId]);
  return status;
}

export function useReviewSyncStatus() {
  const { id: profileId } = useActiveProfile();
  return { ...useSyncStatus(profileId), retry: () => retryPendingReviews(profileId) };
}

export function useAnswerSubmit(sessionId: string) {
  const { id: profileId } = useActiveProfile();
  const status = useSyncStatus(profileId, sessionId);
  const submit = useCallback((input: Omit<SubmitReviewRequest, "sessionId">, onSynced?: (response: SubmitReviewResponse) => void) => {
    enqueuePendingReview(profileId, { ...input, sessionId }, onSynced);
  }, [profileId, sessionId]);
  return { ...status, retry: () => retryPendingReviews(profileId), submit };
}
