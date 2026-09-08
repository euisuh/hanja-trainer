import { useCallback, useEffect, useState } from "react";
import { useActiveProfile } from "../profile/ProfileContext";
import { ApiClientError, PIN_REQUIRED_EVENT, apiClient, isAuthenticationError, retryDelayMs } from "../../lib/apiClient";
import { MAX_REVIEW_BATCH_SIZE, type SubmitReviewRequest, type SubmitReviewResponse } from "../../shared/api";
import { parseReviewRequest } from "../../shared/review";

type PendingReview = { profileId: number; input: SubmitReviewRequest; onSynced?: (response: SubmitReviewResponse) => void };
export type RejectedReview = { profileId: number | null; raw: unknown; errorCode: string };
export type ReviewSyncStatus = { pendingCount: number; rejectedCount: number; failed: boolean; errorCode: string | null };
type StoredReview = Pick<PendingReview, "profileId" | "input">;
type StoredState = { version: 1; pending: StoredReview[]; rejected: RejectedReview[] };
type QueueEntry = [string, PendingReview];

const pending = new Map<string, PendingReview>();
const rejected: RejectedReview[] = [];
const STORAGE_KEY = "hanja-trainer:pending-reviews";
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

function persist() {
  try {
    if (typeof localStorage === "undefined") return;
    if (pending.size === 0 && rejected.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const state: StoredState = {
      version: 1,
      pending: [...pending.values()].map(({ profileId, input }) => ({ profileId, input })),
      rejected,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* Private mode or a full quota must not break answering. */ }
}

function restorePending(raw: unknown) {
  const row = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  const profileId = row?.profileId;
  const input = parseReviewRequest(row?.input);
  if (validProfileId(profileId) && input) {
    pending.set(keyOf(profileId, input), { profileId, input });
    return;
  }
  rejected.push({ profileId: validProfileId(profileId) ? profileId : null, raw, errorCode: "invalid_stored_review" });
}

function restoreRejected(raw: unknown) {
  const row = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  if (row && (row.profileId === null || validProfileId(row.profileId)) && typeof row.errorCode === "string" && row.errorCode.length > 0 && "raw" in row) {
    rejected.push({ profileId: row.profileId as number | null, raw: row.raw, errorCode: row.errorCode });
  } else {
    rejected.push({ profileId: null, raw, errorCode: "invalid_stored_rejection" });
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
  if (stored === null) return;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      parsed.forEach(restorePending);
      return;
    }
    const state = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    if (state?.version === 1 && Array.isArray(state.pending) && Array.isArray(state.rejected)) {
      state.pending.forEach(restorePending);
      state.rejected.forEach(restoreRejected);
      return;
    }
    rejected.push({ profileId: null, raw: parsed, errorCode: "invalid_stored_queue" });
  } catch {
    rejected.push({ profileId: null, raw: stored, errorCode: "invalid_stored_json" });
  }
}

rehydrate();

function notify() {
  persist();
  for (const listener of listeners) listener();
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
    try { item.onSynced?.(results[index]); } catch { /* A view callback cannot invalidate a server acknowledgement. */ }
  });
}

async function submitEntries(profileId: number, entries: QueueEntry[]) {
  const response = await apiClient.submitReviews(profileId, entries.map(([, item]) => item.input));
  acknowledge(entries, response);
  retryAttempts.delete(profileId);
  failedProfiles.delete(profileId);
  lastErrors.delete(profileId);
  notify();
}

function permanentError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError && error.status >= 400 && error.status < 500
    && error.status !== 408 && error.status !== 429 && !isAuthenticationError(error);
}

function rejectEntry(entry: QueueEntry, error: ApiClientError) {
  const [key, item] = entry;
  if (pending.get(key) !== item) return;
  pending.delete(key);
  rejected.push({ profileId: item.profileId, raw: { profileId: item.profileId, input: item.input }, errorCode: error.code });
  failedProfiles.add(item.profileId);
  lastErrors.set(item.profileId, error.code);
}

async function submitOrIsolate(profileId: number, entries: QueueEntry[]) {
  try {
    await submitEntries(profileId, entries);
  } catch (error) {
    if (!permanentError(error)) throw error;
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
        if (permanentError(individualError)) {
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
  if (pending.size >= MAX_PENDING) {
    const oldest = pending.entries().next();
    if (!oldest.done) {
      pending.delete(oldest.value[0]);
      rejected.push({ profileId: oldest.value[1].profileId, raw: { profileId: oldest.value[1].profileId, input: oldest.value[1].input }, errorCode: "queue_capacity" });
    }
  }
  pending.set(keyOf(profileId, input), { profileId, input, onSynced });
  notify();
  if (profileId === activeProfileId && !retryTimers.has(profileId) && !authPausedProfiles.has(profileId)) void flushPendingReviews(profileId);
}

export function pendingReviewCount(profileId: number, sessionId?: string): number {
  return [...pending.values()].filter((item) => item.profileId === profileId && (!sessionId || item.input.sessionId === sessionId)).length;
}

export function reviewSyncStatus(profileId: number, sessionId?: string): ReviewSyncStatus {
  const rejectedCount = visibleRejected(profileId).length;
  return {
    pendingCount: pendingReviewCount(profileId, sessionId),
    rejectedCount,
    failed: failedProfiles.has(profileId) || rejectedCount > 0,
    errorCode: lastErrors.get(profileId) ?? (rejectedCount > 0 ? visibleRejected(profileId)[0].errorCode : null),
  };
}

export function exportRejectedReviews(profileId: number): string {
  return JSON.stringify(visibleRejected(profileId), null, 2);
}

export function discardRejectedReviews(profileId: number) {
  for (let index = rejected.length - 1; index >= 0; index -= 1) {
    if (rejected[index].profileId === null || rejected[index].profileId === profileId) rejected.splice(index, 1);
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
  rejected.splice(0);
  persist();
  flushing.clear();
  retryAttempts.clear();
  failedProfiles.clear();
  authPausedProfiles.clear();
  lastErrors.clear();
  activeProfileId = null;
  listeners.clear();
}

function useSyncStatus(profileId: number, sessionId?: string) {
  const [status, setStatus] = useState(() => reviewSyncStatus(profileId, sessionId));
  useEffect(() => {
    const update = () => setStatus(reviewSyncStatus(profileId, sessionId));
    const handleOnline = () => void flushPendingReviews(profileId);
    listeners.add(update);
    window.addEventListener("online", handleOnline);
    update();
    return () => {
      listeners.delete(update);
      window.removeEventListener("online", handleOnline);
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
