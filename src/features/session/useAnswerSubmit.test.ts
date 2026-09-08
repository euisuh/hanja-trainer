import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, PIN_REQUIRED_EVENT, apiClient } from "../../lib/apiClient";
import type { SubmitReviewRequest, SubmitReviewResponse } from "../../shared/api";
import { enqueuePendingReview, exportRejectedReviews, flushPendingReviews, pendingReviewCount, resetAnswerSubmitForTests, reviewSyncStatus, setAnswerSubmitProfile } from "./useAnswerSubmit";

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
    expect(submit).toHaveBeenCalledWith(2, [expect.objectContaining({ sessionId: "profile-b" })]);
    expect(pendingReviewCount(1)).toBe(1);

    setAnswerSubmitProfile(1);
    await vi.waitFor(() => expect(pendingReviewCount(1)).toBe(0));
    expect(submit).toHaveBeenLastCalledWith(1, [expect.objectContaining({ sessionId: "profile-a" })]);
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

    expect(JSON.parse(storage.getItem(storageKey) ?? "{}")).toEqual({
      version: 1,
      pending: [
        { profileId: 1, input: review("offline", 0) },
        { profileId: 1, input: review("offline", 1) },
      ],
      rejected: [],
    });
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

    await vi.waitFor(() => expect(submit).toHaveBeenCalledWith(1, [review("restored", 0), review("restored", 1)]));
    await vi.waitFor(() => expect(storage.getItem(storageKey)).toBeNull());
    fresh.resetAnswerSubmitForTests();
  });

  it("reloads replayable and rejected records with their original owners", async () => {
    const stored = {
      version: 1,
      pending: [
        { profileId: 1, input: review("owner-a", 0) },
        { profileId: 2, input: review("owner-b", 0) },
      ],
      rejected: [{ profileId: 2, raw: { profileId: 2, input: { sessionId: "bad" } }, errorCode: "invalid_review" }],
    };
    const storage = localStorageStub(JSON.stringify(stored));
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", { onLine: true });
    vi.resetModules();
    const { apiClient: freshApiClient } = await import("../../lib/apiClient");
    vi.spyOn(freshApiClient, "submitReviews").mockResolvedValue({ results: [response] });
    const fresh = await import("./useAnswerSubmit");

    fresh.setAnswerSubmitProfile(2);

    await vi.waitFor(() => expect(fresh.pendingReviewCount(2)).toBe(0));
    expect(fresh.pendingReviewCount(1)).toBe(1);
    expect(fresh.reviewSyncStatus(1).rejectedCount).toBe(0);
    expect(fresh.reviewSyncStatus(2).rejectedCount).toBe(1);
    expect(JSON.parse(fresh.exportRejectedReviews(2))).toEqual(stored.rejected);
    fresh.resetAnswerSubmitForTests();
  });

  it.each(["not json", '{"a":1}'])("preserves invalid stored data for export: %s", async (stored) => {
    vi.stubGlobal("localStorage", localStorageStub(stored));
    vi.resetModules();
    const fresh = await import("./useAnswerSubmit");

    expect(fresh.pendingReviewCount(1)).toBe(0);
    expect(fresh.reviewSyncStatus(1).rejectedCount).toBe(1);
    expect(JSON.parse(fresh.exportRejectedReviews(1))).toEqual([
      expect.objectContaining({ errorCode: expect.stringMatching(/^invalid_stored_/) }),
    ]);
    fresh.resetAnswerSubmitForTests();
  });

  it("does not crash when privacy settings block storage access", async () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => { throw new DOMException("blocked", "SecurityError"); }),
      setItem: vi.fn(() => { throw new DOMException("blocked", "SecurityError"); }),
      removeItem: vi.fn(() => { throw new DOMException("blocked", "SecurityError"); }),
    });
    vi.resetModules();

    const fresh = await import("./useAnswerSubmit");

    expect(fresh.pendingReviewCount(1)).toBe(0);
    expect(() => fresh.enqueuePendingReview(1, review("private", 0))).not.toThrow();
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

  it("drains a large backlog immediately in ordered, bounded batches", async () => {
    const connection = { onLine: false };
    vi.stubGlobal("navigator", connection);
    const submit = vi.spyOn(apiClient, "submitReviews").mockImplementation(async (_profileId, inputs) => ({ results: inputs.map(() => response) }));

    setAnswerSubmitProfile(1);
    for (let cardIndex = 0; cardIndex < 100; cardIndex += 1) enqueuePendingReview(1, review("backlog", cardIndex));
    connection.onLine = true;
    setAnswerSubmitProfile(1);

    await vi.waitFor(() => expect(pendingReviewCount(1)).toBe(0));
    expect(submit).toHaveBeenCalledTimes(25);
    expect(submit.mock.calls.every(([, inputs]) => inputs.length <= 4)).toBe(true);
    expect(submit.mock.calls.flatMap(([, inputs]) => inputs.map((input) => input.cardIndex))).toEqual(Array.from({ length: 100 }, (_, index) => index));
  });

  it("stops draining the old profile after a profile switch", async () => {
    const connection = { onLine: false };
    vi.stubGlobal("navigator", connection);
    let releaseFirst!: (value: { results: SubmitReviewResponse[] }) => void;
    const first = new Promise<{ results: SubmitReviewResponse[] }>((resolve) => { releaseFirst = resolve; });
    const submit = vi.spyOn(apiClient, "submitReviews").mockReturnValueOnce(first).mockImplementation(async (_profileId, inputs) => ({ results: inputs.map(() => response) }));

    setAnswerSubmitProfile(1);
    for (let cardIndex = 0; cardIndex < 8; cardIndex += 1) enqueuePendingReview(1, review("profile-a", cardIndex));
    enqueuePendingReview(2, review("profile-b", 0));
    connection.onLine = true;
    setAnswerSubmitProfile(1);
    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    setAnswerSubmitProfile(2);
    releaseFirst({ results: Array.from({ length: 4 }, () => response) });

    await vi.waitFor(() => expect(pendingReviewCount(2)).toBe(0));
    expect(submit.mock.calls.filter(([, inputs]) => inputs[0].sessionId === "profile-a")).toHaveLength(1);
    expect(pendingReviewCount(1)).toBe(4);
  });

  it("evicts the oldest review when the queue reaches its cap", () => {
    const storage = localStorageStub();
    vi.stubGlobal("localStorage", storage);

    for (let cardIndex = 0; cardIndex <= 500; cardIndex += 1) {
      enqueuePendingReview(1, review("long-offline", cardIndex));
    }

    const stored = JSON.parse(storage.getItem(storageKey) ?? "{}") as { pending: Array<{ input: SubmitReviewRequest }>; rejected: unknown[] };
    expect(pendingReviewCount(1)).toBe(500);
    expect(stored.pending).toHaveLength(500);
    expect(stored.pending[0].input.cardIndex).toBe(1);
    expect(stored.rejected).toHaveLength(1);
  });
});

describe("review retry recovery", () => {
  afterEach(() => {
    resetAnswerSubmitForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("isolates a permanent bad answer once and drains valid neighbors", async () => {
    const connection = { onLine: false };
    vi.stubGlobal("navigator", connection);
    const submit = vi.spyOn(apiClient, "submitReviews").mockImplementation(async (_profileId, inputs) => {
      if (inputs.length > 1 || inputs[0].cardIndex === 1) throw new ApiClientError(400, "invalid_review", "bad review");
      return { results: [response] };
    });
    setAnswerSubmitProfile(1);
    enqueuePendingReview(1, review("mixed", 0));
    enqueuePendingReview(1, review("mixed", 1));
    enqueuePendingReview(1, review("mixed", 2));
    connection.onLine = true;

    await flushPendingReviews(1);

    expect(submit).toHaveBeenCalledTimes(4);
    expect(pendingReviewCount(1)).toBe(0);
    expect(reviewSyncStatus(1)).toMatchObject({ rejectedCount: 1, errorCode: "invalid_review" });
    expect(JSON.parse(exportRejectedReviews(1))[0]).toMatchObject({ profileId: 1, errorCode: "invalid_review" });
  });

  it("keeps every entry when a successful response is truncated", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const setTimer = globalThis.setTimeout;
    const clearTimer = globalThis.clearTimeout;
    vi.stubGlobal("window", { setTimeout: setTimer, clearTimeout: clearTimer, dispatchEvent: vi.fn() });
    const connection = { onLine: false };
    vi.stubGlobal("navigator", connection);
    const submit = vi.spyOn(apiClient, "submitReviews")
      .mockResolvedValueOnce({ results: [] })
      .mockImplementation(async (_profileId, inputs) => ({ results: inputs.map(() => response) }));
    setAnswerSubmitProfile(1);
    enqueuePendingReview(1, review("truncated", 0));
    enqueuePendingReview(1, review("truncated", 1));
    connection.onLine = true;

    await flushPendingReviews(1);
    expect(pendingReviewCount(1)).toBe(2);
    expect(submit).toHaveBeenCalledTimes(1);
    enqueuePendingReview(1, review("truncated", 2));
    await flushPendingReviews(1);
    expect(submit).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(pendingReviewCount(1)).toBe(0));
  });

  it("grows and caps queue backoff, then resets it after success", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(1);
    const setTimer = globalThis.setTimeout;
    const clearTimer = globalThis.clearTimeout;
    vi.stubGlobal("window", { setTimeout: setTimer, clearTimeout: clearTimer, dispatchEvent: vi.fn() });
    const timerSpy = vi.spyOn(window, "setTimeout");
    const connection = { onLine: false };
    vi.stubGlobal("navigator", connection);
    let request = 0;
    vi.spyOn(apiClient, "submitReviews").mockImplementation(async (_profileId, inputs) => {
      request += 1;
      if (request <= 10 || request === 12) throw new TypeError("network unavailable");
      return { results: inputs.map(() => response) };
    });
    setAnswerSubmitProfile(1);
    enqueuePendingReview(1, review("backoff", 0));
    connection.onLine = true;

    await flushPendingReviews(1);
    const delays = [2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 256_000, 300_000, 300_000];
    expect(timerSpy.mock.calls.at(-1)?.[1]).toBe(delays[0]);
    for (const [index, delay] of delays.slice(0, -1).entries()) {
      await vi.advanceTimersByTimeAsync(delay);
      expect(timerSpy.mock.calls.at(-1)?.[1]).toBe(delays[index + 1]);
    }
    await vi.advanceTimersByTimeAsync(delays.at(-1)!);
    expect(pendingReviewCount(1)).toBe(0);

    connection.onLine = false;
    enqueuePendingReview(1, review("backoff-reset", 0));
    connection.onLine = true;
    await flushPendingReviews(1);
    expect(timerSpy.mock.calls.at(-1)?.[1]).toBe(2_000);
  });

  it("stops member isolation when throttled and preserves later entries", async () => {
    const connection = { onLine: false };
    vi.stubGlobal("navigator", connection);
    const setTimeoutSpy = vi.fn(() => 1);
    vi.stubGlobal("window", { setTimeout: setTimeoutSpy, clearTimeout: vi.fn(), dispatchEvent: vi.fn() });
    const submit = vi.spyOn(apiClient, "submitReviews")
      .mockRejectedValueOnce(new ApiClientError(400, "invalid_review", "bad batch"))
      .mockRejectedValueOnce(new ApiClientError(429, "rate_limited", "slow down", 30));
    setAnswerSubmitProfile(1);
    enqueuePendingReview(1, review("throttled", 0));
    enqueuePendingReview(1, review("throttled", 1));
    enqueuePendingReview(1, review("throttled", 2));
    connection.onLine = true;

    await flushPendingReviews(1);

    expect(submit).toHaveBeenCalledTimes(2);
    expect(pendingReviewCount(1)).toBe(3);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);
  });

  it("pauses authentication failures until the profile is activated again", async () => {
    const dispatchEvent = vi.fn();
    const setTimeoutSpy = vi.fn(() => 1);
    vi.stubGlobal("window", { dispatchEvent, setTimeout: setTimeoutSpy, clearTimeout: vi.fn() });
    const connection = { onLine: false };
    vi.stubGlobal("navigator", connection);
    const submit = vi.spyOn(apiClient, "submitReviews")
      .mockRejectedValueOnce(new ApiClientError(409, "profile_changed", "changed"))
      .mockImplementation(async (_profileId, inputs) => ({ results: inputs.map(() => response) }));
    setAnswerSubmitProfile(1);
    enqueuePendingReview(1, review("auth", 0));
    connection.onLine = true;

    await flushPendingReviews(1);
    enqueuePendingReview(1, review("auth", 1));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: PIN_REQUIRED_EVENT }));

    setAnswerSubmitProfile(1);
    await vi.waitFor(() => expect(pendingReviewCount(1)).toBe(0));
  });
});
