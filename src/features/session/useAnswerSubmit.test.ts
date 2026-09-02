import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../lib/apiClient";
import type { SubmitReviewRequest, SubmitReviewResponse } from "../../shared/api";
import { enqueuePendingReview, pendingReviewCount, resetAnswerSubmitForTests, setAnswerSubmitProfile } from "./useAnswerSubmit";

const response: SubmitReviewResponse = {
  due: "2026-09-03T00:00:00.000Z",
  scheduledDays: 1,
  stability: 1,
  difficulty: 5,
  dueLabel: "내일",
};

function review(sessionId: string, cardIndex: number): SubmitReviewRequest {
  return { sessionId, cardIndex, characterKey: "一", track: "kr", correct: true, skipped: false, elapsedMs: 500, mode: "review" };
}

describe("profile-scoped pending reviews", () => {
  afterEach(() => {
    resetAnswerSubmitForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps one profile's pending review while another profile syncs", async () => {
    const connection = { onLine: false };
    vi.stubGlobal("navigator", connection);
    const submit = vi.spyOn(apiClient, "submitReviews").mockResolvedValue({ results: [response] });

    setAnswerSubmitProfile(1);
    enqueuePendingReview(1, review("profile-a", 0));
    expect(pendingReviewCount(1)).toBe(1);
    expect(submit).not.toHaveBeenCalled();

    setAnswerSubmitProfile(2);
    connection.onLine = true;
    enqueuePendingReview(2, review("profile-b", 0));
    await vi.waitFor(() => expect(pendingReviewCount(2)).toBe(0));
    expect(submit).toHaveBeenCalledWith([expect.objectContaining({ sessionId: "profile-b" })]);
    expect(pendingReviewCount(1)).toBe(1);

    setAnswerSubmitProfile(1);
    await vi.waitFor(() => expect(pendingReviewCount(1)).toBe(0));
    expect(submit).toHaveBeenLastCalledWith([expect.objectContaining({ sessionId: "profile-a" })]);
  });

  it("does not let a stale authentication failure interrupt the next profile", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent, clearTimeout: vi.fn(), setTimeout: vi.fn(() => 1) });
    let rejectFirst!: (reason: unknown) => void;
    const first = new Promise<{ results: SubmitReviewResponse[] }>((_resolve, reject) => { rejectFirst = reject; });
    vi.spyOn(apiClient, "submitReviews")
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ results: [response] });

    setAnswerSubmitProfile(1);
    enqueuePendingReview(1, review("profile-a", 0));
    setAnswerSubmitProfile(2);
    enqueuePendingReview(2, review("profile-b", 0));
    rejectFirst(new Error("expired profile A"));

    await vi.waitFor(() => expect(pendingReviewCount(2)).toBe(0));
    expect(pendingReviewCount(1)).toBe(1);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
