import { useEffect, useState } from "react";
import { useActiveProfile } from "../profile/ProfileContext";
import { ApiClientError, PIN_REQUIRED_EVENT, apiClient, isAuthenticationError, isPermanentApiError, retryDelayMs } from "../../lib/apiClient";
import type { CreateSessionRequest } from "../../shared/api";
import { parseSessionRequest } from "../../shared/session";

export type KeyedSessionSummary = CreateSessionRequest & { sessionId: string };
type PendingSummary = { profileId: number; input: KeyedSessionSummary };
type RejectedSummary = { profileId: number | null; raw: unknown; errorCode: string };
type StoredState = { version: 1; pending: PendingSummary[]; rejected: RejectedSummary[] };
export type SessionSummaryStatus = { pendingCount: number; rejectedCount: number; failed: boolean; pendingFailed: boolean; errorCode: string | null };

const STORAGE_KEY = "hanja-trainer:pending-session-summaries";
const pending = new Map<string, PendingSummary>();
const rejected: RejectedSummary[] = [];
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

function restoreSummary(value: unknown) {
  const row = typeof value === "object" && value !== null && !Array.isArray(value) ? value as { profileId?: unknown; input?: unknown } : null;
  const profileId = Number.isSafeInteger(row?.profileId) && (row!.profileId as number) > 0 ? row!.profileId as number : null;
  const input = parseSessionRequest(row?.input);
  if (profileId !== null && input?.sessionId) {
    pending.set(keyOf(profileId, input.sessionId), { profileId, input: input as KeyedSessionSummary });
    return;
  }
  rejected.push({ profileId, raw: value, errorCode: "invalid_stored_summary" });
}

function persist() {
  try {
    if (typeof localStorage === "undefined") return;
    if (pending.size === 0 && rejected.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, pending: [...pending.values()], rejected } satisfies StoredState));
  } catch { /* Blocked storage must not prevent completion or an in-memory retry. */ }
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
      parsed.forEach(restoreSummary);
      return;
    }
    const state = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Partial<StoredState> : null;
    if (state?.version !== 1 || !Array.isArray(state.pending) || !Array.isArray(state.rejected)) {
      rejected.push({ profileId: null, raw: parsed, errorCode: "invalid_stored_queue" });
      return;
    }
    state.pending.forEach(restoreSummary);
    for (const item of state.rejected) {
      if (item && (item.profileId === null || Number.isSafeInteger(item.profileId) && item.profileId > 0) && typeof item.errorCode === "string" && "raw" in item) rejected.push(item);
      else rejected.push({ profileId: null, raw: item, errorCode: "invalid_stored_rejection" });
    }
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
      try {
        await apiClient.createSession(profileId, item.input);
        if (pending.get(key) === item) pending.delete(key);
      } catch (error) {
        if (!isPermanentApiError(error)) throw error;
        if (pending.get(key) === item) {
          pending.delete(key);
          rejected.push({ profileId, raw: item, errorCode: error.code });
        }
      }
      retryAttempts.delete(profileId);
      failedProfiles.delete(profileId);
      lastErrors.delete(profileId);
      notify();
      entry = nextFor(profileId);
    }
  } catch (error) {
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
  pending.set(keyOf(profileId, input.sessionId), { profileId, input });
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
  return [...pending.values()].filter((item) => item.profileId === profileId).length;
}

export function exportRejectedSummaries(profileId: number): string {
  return JSON.stringify(rejected.filter((item) => item.profileId === null || item.profileId === profileId), null, 2);
}

export function discardRejectedSummaries(profileId: number) {
  for (let index = rejected.length - 1; index >= 0; index -= 1) {
    if (rejected[index].profileId === null || rejected[index].profileId === profileId) rejected.splice(index, 1);
  }
  notify();
}

export function sessionSummaryStatus(profileId: number): SessionSummaryStatus {
  const visibleRejected = rejected.filter((item) => item.profileId === null || item.profileId === profileId);
  const rejectedCount = visibleRejected.length;
  const pendingFailed = failedProfiles.has(profileId);
  return { pendingCount: pendingSummaryCount(profileId), rejectedCount, failed: pendingFailed || rejectedCount > 0, pendingFailed, errorCode: lastErrors.get(profileId) ?? visibleRejected[0]?.errorCode ?? null };
}

export function resetSessionSummaryForTests() {
  for (const profileId of retryTimers.keys()) clearRetry(profileId);
  pending.clear();
  rejected.splice(0);
  persist();
  listeners.clear();
  flushing.clear();
  retryAttempts.clear();
  authPaused.clear();
  failedProfiles.clear();
  lastErrors.clear();
  activeProfileId = null;
}

export function useSessionSummaryStatus() {
  const { id: profileId } = useActiveProfile();
  const [status, setStatus] = useState(() => sessionSummaryStatus(profileId));
  useEffect(() => {
    const update = () => setStatus(sessionSummaryStatus(profileId));
    const handleOnline = () => void flushPendingSummaries(profileId);
    listeners.add(update);
    window.addEventListener("online", handleOnline);
    update();
    return () => {
      listeners.delete(update);
      window.removeEventListener("online", handleOnline);
    };
  }, [profileId]);
  return { ...status, retry: () => retryPendingSummaries(profileId) };
}
