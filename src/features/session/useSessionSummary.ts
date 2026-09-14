import { useActiveProfile } from "../profile/ProfileContext";
import { apiClient } from "../../lib/apiClient";
import type { CreateSessionRequest } from "../../../shared/api";
import { parseSessionRequest } from "../../../shared/session";
import { createOutbox, type OutboxStatus } from "./outbox";

export type KeyedSessionSummary = CreateSessionRequest & { sessionId: string };
export type SessionSummaryStatus = OutboxStatus;

const summaries = createOutbox<KeyedSessionSummary, void>({
  storageKey: "hanja-trainer:pending-session-summaries",
  keyOf: (profileId, input) => `${profileId}:${input.sessionId}`,
  parse: (raw) => {
    const input = parseSessionRequest(raw);
    return input?.sessionId ? input as KeyedSessionSummary : null;
  },
  invalidStoredCode: "invalid_stored_summary",
  batchSize: 1,
  rejectionMarksFailure: false,
  send: async (profileId, [input]) => {
    await apiClient.createSession(profileId, input);
    return [undefined];
  },
});

export const flushPendingSummaries = summaries.flush;
export const retryPendingSummaries = summaries.retry;
export const setSessionSummaryProfile = summaries.setProfile;
export const pendingSummaryCount = (profileId: number) => summaries.pendingCount(profileId);
export const exportRejectedSummaries = summaries.exportRejected;
export const discardRejectedSummaries = summaries.discardRejected;
export const sessionSummaryStatus = (profileId: number): SessionSummaryStatus => summaries.status(profileId);
export const resetSessionSummaryForTests = summaries.resetForTests;
export const syncSummaryStorageEvent = summaries.syncStorageEvent;
export const enqueuePendingSummary = (profileId: number, input: KeyedSessionSummary) => summaries.enqueue(profileId, input);

export function useSessionSummaryStatus() {
  const { id: profileId } = useActiveProfile();
  return { ...summaries.useStatus(profileId), retry: () => retryPendingSummaries(profileId) };
}
