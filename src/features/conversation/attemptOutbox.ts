/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-unsafe-dictionary-type -- Persisted outbox payload parser validates each field before replay. */
import { ApiClientError, apiClient } from "../../lib/apiClient";
import { MAX_REVIEW_BATCH_SIZE, type SubmitConversationAttemptRequest, type SubmitConversationAttemptResponse } from "../../../shared/api";
import { createOutbox } from "../session/outbox";

function parseAttempt(value: unknown): SubmitConversationAttemptRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.clientAttemptId !== "string" || input.clientAttemptId.length < 1 || input.clientAttemptId.length > 128) return null;
  if (!Number.isSafeInteger(input.chunkId) || (input.chunkId as number) < 1) return null;
  if (input.sceneId !== undefined && input.sceneId !== null && (!Number.isSafeInteger(input.sceneId) || (input.sceneId as number) < 1)) return null;
  if (input.role !== "say" && input.role !== "hear") return null;
  if (input.grade !== "again" && input.grade !== "hard" && input.grade !== "good" && input.grade !== "easy") return null;
  if (!Number.isSafeInteger(input.answeredAt) || (input.answeredAt as number) < 0) return null;
  if (input.latencyMs !== undefined && input.latencyMs !== null && (!Number.isSafeInteger(input.latencyMs) || (input.latencyMs as number) < 0)) return null;
  if (input.hints !== undefined && (!Number.isSafeInteger(input.hints) || (input.hints as number) < 0)) return null;
  if (input.replays !== undefined && (!Number.isSafeInteger(input.replays) || (input.replays as number) < 0)) return null;
  return input as SubmitConversationAttemptRequest;
}

function validResult(value: unknown): value is SubmitConversationAttemptResponse {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && ["again", "hard", "good", "easy"].includes((value as Record<string, unknown>).grade as string);
}

const attempts = createOutbox<SubmitConversationAttemptRequest, SubmitConversationAttemptResponse>({
  storageKey: "hanja-trainer:pending-conversation-attempts",
  keyOf: (profileId, input) => `${profileId}:${input.clientAttemptId}`,
  parse: parseAttempt,
  invalidStoredCode: "invalid_stored_conversation_attempt",
  batchSize: MAX_REVIEW_BATCH_SIZE,
  maxPending: 500,
  rejectionMarksFailure: true,
  send: async (profileId, inputs) => {
    const response = await apiClient.submitConversationAttempts(profileId, inputs);
    const results: unknown = response?.results;
    if (!Array.isArray(results) || results.length !== inputs.length || !results.every(validResult)) {
      throw new ApiClientError(502, "invalid_response", "The server returned an incomplete conversation attempt response.");
    }
    return results;
  },
});

export const flushPendingConversationAttempts = attempts.flush;
export const retryPendingConversationAttempts = attempts.retry;
export const setConversationAttemptProfile = attempts.setProfile;
export const enqueuePendingConversationAttempt = attempts.enqueue;
export const pendingConversationAttemptCount = attempts.pendingCount;
export const resetConversationAttemptOutboxForTests = attempts.resetForTests;
