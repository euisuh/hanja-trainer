import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient";
import type { SubmitReviewRequest, SubmitReviewResponse } from "../../shared/api";

type PendingReview = { input: SubmitReviewRequest; onSynced?: (response: SubmitReviewResponse) => void };

const pending = new Map<string, PendingReview>();
const listeners = new Set<() => void>();
let flushing = false;
let retryTimer: number | undefined;
let syncFailed = false;

function keyOf(input: SubmitReviewRequest): string {
  return `${input.sessionId}:${input.cardIndex}`;
}

function notify() {
  for (const listener of listeners) listener();
}

function scheduleRetry() {
  window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(() => void flush(), 2_000);
}

async function flush() {
  if (flushing || pending.size === 0 || !navigator.onLine) return;
  flushing = true;
  const entries = [...pending.entries()].slice(0, 100);
  try {
    const response = await apiClient.submitReviews(entries.map(([, item]) => item.input));
    syncFailed = false;
    entries.forEach(([key, item], index) => {
      if (pending.get(key) !== item) return;
      pending.delete(key);
      item.onSynced?.(response.results[index]);
    });
  } catch {
    syncFailed = true;
    scheduleRetry();
  } finally {
    flushing = false;
    notify();
    if (pending.size > 0 && navigator.onLine) scheduleRetry();
  }
}

export function useAnswerSubmit(sessionId: string) {
  const [pendingCount, setPendingCount] = useState(0);
  const [failed, setFailed] = useState(syncFailed);
  useEffect(() => {
    const update = () => {
      setPendingCount([...pending.values()].filter((item) => item.input.sessionId === sessionId).length);
      setFailed(syncFailed);
    };
    const online = () => void flush();
    listeners.add(update);
    window.addEventListener("online", online);
    update();
    return () => {
      listeners.delete(update);
      window.removeEventListener("online", online);
    };
  }, [sessionId]);

  const submit = useCallback((input: Omit<SubmitReviewRequest, "sessionId">, onSynced?: (response: SubmitReviewResponse) => void) => {
    pending.set(keyOf({ ...input, sessionId }), { input: { ...input, sessionId }, onSynced });
    notify();
    void flush();
  }, [sessionId]);

  return { failed, pendingCount, retry: flush, submit };
}
