import { useCallback } from "react";
import { useActiveProfile } from "../profile/ProfileContext";
import { ApiClientError, apiClient } from "../../lib/apiClient";
import { MAX_REVIEW_BATCH_SIZE, type SubmitReviewRequest, type SubmitReviewResponse } from "../../../shared/api";
import { parseReviewRequest } from "../../../shared/review";
import { createOutbox, type RejectedEntry } from "./outbox";

export type RejectedReview = RejectedEntry;
export type ReviewSyncStatus = { pendingCount: number; rejectedCount: number; failed: boolean; errorCode: string | null };

function validReviewResponse(value: unknown): value is SubmitReviewResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return typeof result.due === "string" && Number.isFinite(Date.parse(result.due))
    && typeof result.scheduledDays === "number" && Number.isFinite(result.scheduledDays)
    && typeof result.stability === "number" && Number.isFinite(result.stability)
    && typeof result.difficulty === "number" && Number.isFinite(result.difficulty)
    && typeof result.dueLabel === "string";
}

const reviews = createOutbox<SubmitReviewRequest, SubmitReviewResponse>({
  storageKey: "hanja-trainer:pending-reviews",
  keyOf: (profileId, input) => `${profileId}:${input.sessionId}:${input.cardIndex}`,
  parse: parseReviewRequest,
  invalidStoredCode: "invalid_stored_review",
  batchSize: MAX_REVIEW_BATCH_SIZE,
  maxPending: 500,
  sessionOf: (input) => input.sessionId,
  rejectionMarksFailure: true,
  send: async (profileId, inputs) => {
    const response = await apiClient.submitReviews(profileId, inputs);
    const results: unknown = response?.results;
    if (!Array.isArray(results) || results.length !== inputs.length || !results.every(validReviewResponse)) {
      throw new ApiClientError(502, "invalid_response", "The server returned an incomplete review response.");
    }
    return results;
  },
});

export const flushPendingReviews = reviews.flush;
export const retryPendingReviews = reviews.retry;
export const setAnswerSubmitProfile = reviews.setProfile;
export const enqueuePendingReview = reviews.enqueue;
export const pendingReviewCount = reviews.pendingCount;
export const exportRejectedReviews = reviews.exportRejected;
export const discardRejectedReviews = reviews.discardRejected;
export const resetAnswerSubmitForTests = reviews.resetForTests;
export const syncReviewStorageEvent = reviews.syncStorageEvent;

export function reviewSyncStatus(profileId: number, sessionId?: string): ReviewSyncStatus {
  const { pendingCount, rejectedCount, failed, errorCode } = reviews.status(profileId, sessionId);
  return { pendingCount, rejectedCount, failed, errorCode };
}

function useSyncStatus(profileId: number, sessionId?: string): ReviewSyncStatus {
  const { pendingCount, rejectedCount, failed, errorCode } = reviews.useStatus(profileId, sessionId);
  return { pendingCount, rejectedCount, failed, errorCode };
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
