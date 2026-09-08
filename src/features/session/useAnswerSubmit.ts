import { useCallback, useEffect, useState } from "react";
import { useActiveProfile } from "../profile/ProfileContext";
import { ApiClientError, PIN_REQUIRED_EVENT, apiClient } from "../../lib/apiClient";
import { MAX_REVIEW_BATCH_SIZE, type SubmitReviewRequest, type SubmitReviewResponse } from "../../shared/api";

type PendingReview = {
  profileId: number;
  input: SubmitReviewRequest;
  onSynced?: (response: SubmitReviewResponse) => void;
};

const pending = new Map<string, PendingReview>();
const STORAGE_KEY = "hanja-trainer:pending-reviews";
const MAX_PENDING = 500;
const listeners = new Set<() => void>();
const flushing = new Set<number>();
const retryTimers = new Map<number, number>();
const failedProfiles = new Set<number>();
let activeProfileId: number | null = null;

function keyOf(profileId: number, input: SubmitReviewRequest): string {
  return `${profileId}:${input.sessionId}:${input.cardIndex}`;
}

// `onSynced` belongs to a mounted SessionRunner, so rehydrated reviews flush silently.
type StoredReview = Pick<PendingReview, "profileId" | "input">;

function persist() {
  try {
    const rows: StoredReview[] = [...pending.values()].map(({ profileId, input }) => ({ profileId, input }));
    if (rows.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch { /* Private mode or a full quota must not break answering. */ }
}

function rehydrate() {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return;
    for (const row of parsed as StoredReview[]) {
      if (!Number.isSafeInteger(row?.profileId) || typeof row?.input?.sessionId !== "string") continue;
      pending.set(keyOf(row.profileId, row.input), { profileId: row.profileId, input: row.input });
    }
  } catch { /* Corrupt storage is discarded, not fatal. */ }
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

function scheduleRetry(profileId: number) {
  if (activeProfileId !== profileId) return;
  clearRetry(profileId);
  retryTimers.set(profileId, window.setTimeout(() => void flushPendingReviews(profileId), 2_000));
}

export async function flushPendingReviews(profileId = activeProfileId): Promise<void> {
  if (profileId === null || activeProfileId !== profileId || flushing.has(profileId) || !online()) return;
  let entries = [...pending.entries()].filter(([, item]) => item.profileId === profileId).slice(0, MAX_REVIEW_BATCH_SIZE);
  if (entries.length === 0) return;
  flushing.add(profileId);
  clearRetry(profileId);
  try {
    while (entries.length > 0) {
      const response = await apiClient.submitReviews(profileId, entries.map(([, item]) => item.input));
      failedProfiles.delete(profileId);
      entries.forEach(([key, item], index) => {
        if (pending.get(key) !== item) return;
        pending.delete(key);
        item.onSynced?.(response.results[index]);
      });
      notify();
      if (activeProfileId !== profileId || !online()) break;
      entries = [...pending.entries()].filter(([, item]) => item.profileId === profileId).slice(0, MAX_REVIEW_BATCH_SIZE);
    }
  } catch (caught) {
    failedProfiles.add(profileId);
    if (activeProfileId === profileId && caught instanceof ApiClientError && (caught.code === "pin_required" || caught.code === "profile_required" || caught.code === "profile_changed")) {
      window.dispatchEvent(new Event(PIN_REQUIRED_EVENT));
    }
  } finally {
    flushing.delete(profileId);
    notify();
    if (activeProfileId === profileId && [...pending.values()].some((item) => item.profileId === profileId) && online()) scheduleRetry(profileId);
  }
}

export function setAnswerSubmitProfile(profileId: number | null) {
  activeProfileId = profileId;
  for (const queuedProfileId of retryTimers.keys()) {
    if (queuedProfileId !== profileId) clearRetry(queuedProfileId);
  }
  notify();
  if (profileId !== null) void flushPendingReviews(profileId);
}

export function enqueuePendingReview(profileId: number, input: SubmitReviewRequest, onSynced?: (response: SubmitReviewResponse) => void) {
  // ponytail: hard cap, oldest-first eviction. Raise it if real sessions approach 500 unsynced answers.
  if (pending.size >= MAX_PENDING) {
    const oldest = pending.keys().next();
    if (!oldest.done) pending.delete(oldest.value);
  }
  pending.set(keyOf(profileId, input), { profileId, input, onSynced });
  notify();
  if (profileId === activeProfileId) void flushPendingReviews(profileId);
}

export function pendingReviewCount(profileId: number, sessionId?: string): number {
  return [...pending.values()].filter((item) => item.profileId === profileId && (!sessionId || item.input.sessionId === sessionId)).length;
}

export function resetAnswerSubmitForTests() {
  for (const profileId of retryTimers.keys()) clearRetry(profileId);
  pending.clear();
  persist();
  flushing.clear();
  failedProfiles.clear();
  activeProfileId = null;
  listeners.clear();
}

export function useAnswerSubmit(sessionId: string) {
  const { id: profileId } = useActiveProfile();
  const [pendingCount, setPendingCount] = useState(() => pendingReviewCount(profileId, sessionId));
  const [failed, setFailed] = useState(() => failedProfiles.has(profileId));
  useEffect(() => {
    const update = () => {
      setPendingCount(pendingReviewCount(profileId, sessionId));
      setFailed(failedProfiles.has(profileId));
    };
    const handleOnline = () => void flushPendingReviews(profileId);
    listeners.add(update);
    window.addEventListener("online", handleOnline);
    update();
    return () => {
      listeners.delete(update);
      window.removeEventListener("online", handleOnline);
    };
  }, [profileId, sessionId]);

  const submit = useCallback((input: Omit<SubmitReviewRequest, "sessionId">, onSynced?: (response: SubmitReviewResponse) => void) => {
    enqueuePendingReview(profileId, { ...input, sessionId }, onSynced);
  }, [profileId, sessionId]);

  return { failed, pendingCount, retry: () => flushPendingReviews(profileId), submit };
}
