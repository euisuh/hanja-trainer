import { useCallback, useEffect, useState } from "react";
import { useActiveProfile } from "../profile/ProfileContext";
import { ApiClientError, PIN_REQUIRED_EVENT, apiClient } from "../../lib/apiClient";
import type { SubmitReviewRequest, SubmitReviewResponse } from "../../shared/api";

type PendingReview = {
  profileId: number;
  input: SubmitReviewRequest;
  onSynced?: (response: SubmitReviewResponse) => void;
};

const pending = new Map<string, PendingReview>();
const listeners = new Set<() => void>();
const flushing = new Set<number>();
const retryTimers = new Map<number, number>();
const failedProfiles = new Set<number>();
let activeProfileId: number | null = null;

function keyOf(profileId: number, input: SubmitReviewRequest): string {
  return `${profileId}:${input.sessionId}:${input.cardIndex}`;
}

function notify() {
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
  const entries = [...pending.entries()].filter(([, item]) => item.profileId === profileId).slice(0, 100);
  if (entries.length === 0) return;
  flushing.add(profileId);
  clearRetry(profileId);
  try {
    const response = await apiClient.submitReviews(entries.map(([, item]) => item.input));
    failedProfiles.delete(profileId);
    entries.forEach(([key, item], index) => {
      if (pending.get(key) !== item) return;
      pending.delete(key);
      item.onSynced?.(response.results[index]);
    });
  } catch (caught) {
    failedProfiles.add(profileId);
    if (activeProfileId === profileId && caught instanceof ApiClientError && (caught.code === "pin_required" || caught.code === "profile_required")) {
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
