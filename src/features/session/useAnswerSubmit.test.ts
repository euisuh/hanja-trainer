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

const storageKey = "hanja-trainer:pending-reviews";

function localStorageStub(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(storageKey, initial);
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  };
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

describe("durable pending reviews", () => {
  afterEach(() => {
    resetAnswerSubmitForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("persists queued reviews without live callbacks", () => {
    const storage = localStorageStub();
    vi.stubGlobal("localStorage", storage);

    enqueuePendingReview(1, review("offline", 0), vi.fn());
    enqueuePendingReview(1, review("offline", 1), vi.fn());

    expect(JSON.parse(storage.getItem(storageKey) ?? "[]")).toEqual([
      { profileId: 1, input: review("offline", 0) },
      { profileId: 1, input: review("offline", 1) },
    ]);
  });

  it("removes persisted reviews after a successful flush", async () => {
    const storage = localStorageStub();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", { onLine: true });
    vi.spyOn(apiClient, "submitReviews").mockResolvedValue({ results: [response] });

    setAnswerSubmitProfile(1);
    enqueuePendingReview(1, review("online", 0));

    await vi.waitFor(() => expect(pendingReviewCount(1)).toBe(0));
    expect(storage.getItem(storageKey)).toBeNull();
  });

  it("rehydrates and flushes stored reviews for the active profile", async () => {
    const storage = localStorageStub(JSON.stringify([
      { profileId: 1, input: review("restored", 0) },
      { profileId: 1, input: review("restored", 1) },
    ]));
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", { onLine: true });
    vi.resetModules();
    const { apiClient: freshApiClient } = await import("../../lib/apiClient");
    const submit = vi.spyOn(freshApiClient, "submitReviews").mockResolvedValue({ results: [response, response] });
    const fresh = await import("./useAnswerSubmit");

    fresh.setAnswerSubmitProfile(1);

    await vi.waitFor(() => expect(submit).toHaveBeenCalledWith([review("restored", 0), review("restored", 1)]));
    await vi.waitFor(() => expect(storage.getItem(storageKey)).toBeNull());
    fresh.resetAnswerSubmitForTests();
  });

  it.each(["not json", '{"a":1}'])("ignores invalid stored data: %s", async (stored) => {
    vi.stubGlobal("localStorage", localStorageStub(stored));
    vi.resetModules();
    const fresh = await import("./useAnswerSubmit");

    expect(fresh.pendingReviewCount(1)).toBe(0);
    fresh.resetAnswerSubmitForTests();
  });

  it("keeps the in-memory queue working when persistence throws", async () => {
    const storage = localStorageStub();
    storage.setItem.mockImplementation(() => { throw new Error("quota exceeded"); });
    const connection = { onLine: false };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", connection);
    vi.spyOn(apiClient, "submitReviews").mockResolvedValue({ results: [response] });

    setAnswerSubmitProfile(1);
    expect(() => enqueuePendingReview(1, review("private", 0))).not.toThrow();
    expect(pendingReviewCount(1)).toBe(1);
    connection.onLine = true;
    setAnswerSubmitProfile(1);

    await vi.waitFor(() => expect(pendingReviewCount(1)).toBe(0));
  });

  it("evicts the oldest review when the queue reaches its cap", () => {
    const storage = localStorageStub();
    vi.stubGlobal("localStorage", storage);

    for (let cardIndex = 0; cardIndex <= 500; cardIndex += 1) {
      enqueuePendingReview(1, review("long-offline", cardIndex));
    }

    const stored = JSON.parse(storage.getItem(storageKey) ?? "[]") as Array<{ input: SubmitReviewRequest }>;
    expect(pendingReviewCount(1)).toBe(500);
    expect(stored).toHaveLength(500);
    expect(stored[0].input.cardIndex).toBe(1);
  });
});
