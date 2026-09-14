import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, PIN_REQUIRED_EVENT, apiClient } from "../../lib/apiClient";
import type { SubmitReviewRequest, SubmitReviewResponse } from "../../../shared/api";
import { discardRejectedReviews, enqueuePendingReview, exportRejectedReviews, flushPendingReviews, pendingReviewCount, resetAnswerSubmitForTests, reviewSyncStatus, setAnswerSubmitProfile, syncReviewStorageEvent } from "./useAnswerSubmit";

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
    get length() { return values.size; },
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  };
}

function storedValues(storage: ReturnType<typeof localStorageStub>, prefix: string) {
  return Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => key?.startsWith(prefix) ?? false)
    .map((key) => JSON.parse(storage.getItem(key)!));
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

    expect(storedValues(storage, `${storageKey}:entry:`)).toEqual([
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

  it("does not replace entries queued by another loaded tab", async () => {
    const storage = localStorageStub();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", { onLine: false });
    vi.resetModules();
    const tabA = await import("./useAnswerSubmit");
    tabA.enqueuePendingReview(1, review("tab-a", 0));
    vi.resetModules();
    const tabB = await import("./useAnswerSubmit");
    tabB.enqueuePendingReview(1, review("tab-b", 0));

    expect(storedValues(storage, `${storageKey}:entry:`).map((item: { input: SubmitReviewRequest }) => item.input.sessionId).sort()).toEqual(["tab-a", "tab-b"]);
    tabA.resetAnswerSubmitForTests();
    tabB.resetAnswerSubmitForTests();
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

  it("discards a malformed per-entry rejection", async () => {
    const storage = localStorageStub();
    const key = `${storageKey}:rejected:malformed`;
    storage.setItem(key, "null");
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();
    const fresh = await import("./useAnswerSubmit");

    expect(() => fresh.discardRejectedReviews(1)).not.toThrow();
    expect(storage.getItem(key)).toBeNull();
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

  it("reports the latest permanent rejection code", async () => {
    vi.stubGlobal("localStorage", localStorageStub());
    vi.stubGlobal("navigator", { onLine: true });
    vi.spyOn(apiClient, "submitReviews")
      .mockRejectedValueOnce(new ApiClientError(400, "first_rejection", "bad"))
      .mockRejectedValueOnce(new ApiClientError(400, "second_rejection", "bad"));
    setAnswerSubmitProfile(1);
    enqueuePendingReview(1, review("rejections", 0));
    await vi.waitFor(() => expect(reviewSyncStatus(1).rejectedCount).toBe(1));
    enqueuePendingReview(1, review("rejections", 1));
    await vi.waitFor(() => expect(reviewSyncStatus(1).rejectedCount).toBe(2));

    expect(reviewSyncStatus(1)).toMatchObject({ pendingCount: 0, failed: true, errorCode: "second_rejection" });
  });

  it("retains a permanently rejected source when quarantine storage is full", async () => {
    const storage = localStorageStub();
    const connection = { onLine: false };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", connection);
    const submit = vi.spyOn(apiClient, "submitReviews").mockRejectedValue(new ApiClientError(400, "invalid_review", "bad"));
    setAnswerSubmitProfile(1);
    enqueuePendingReview(1, review("quota-rejection", 0));
    storage.setItem.mockImplementation((key: string) => {
      if (key.includes(":rejected:")) throw new Error("quota exceeded");
    });
    connection.onLine = true;

    await flushPendingReviews(1);

    expect(submit).toHaveBeenCalledTimes(1);
    expect(reviewSyncStatus(1)).toMatchObject({ pendingCount: 0, rejectedCount: 1 });
    expect(storedValues(storage, `${storageKey}:entry:`)).toHaveLength(1);
    discardRejectedReviews(1);
    expect(storedValues(storage, `${storageKey}:entry:`)).toEqual([]);
  });

  it("keeps the legacy queue when migration storage is full", async () => {
    const legacy = JSON.stringify([ { profileId: 1, input: review("legacy-quota", 0) } ]);
    const storage = localStorageStub(legacy);
    storage.setItem.mockImplementation(() => { throw new Error("quota exceeded"); });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();
    const fresh = await import("./useAnswerSubmit");

    expect(storage.getItem(storageKey)).toBe(legacy);
    expect(fresh.pendingReviewCount(1)).toBe(1);
    fresh.resetAnswerSubmitForTests();
  });

  it("restores every legacy row even when the first migration write fails", async () => {
    const legacy = JSON.stringify([
      { profileId: 1, input: review("first", 0) },
      { profileId: 1, input: review("second", 0) },
    ]);
    const storage = localStorageStub(legacy);
    const write = storage.setItem.getMockImplementation()!;
    storage.setItem.mockImplementationOnce(() => { throw new Error("quota exceeded"); }).mockImplementation(write);
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();
    const fresh = await import("./useAnswerSubmit");

    expect(fresh.pendingReviewCount(1)).toBe(2);
    expect(storedValues(storage, `${storageKey}:entry:`)).toHaveLength(1);
    expect(storage.getItem(storageKey)).toBe(legacy);
    fresh.resetAnswerSubmitForTests();
  });

  it("does not let legacy migration overwrite a newer entry", async () => {
    const legacyInput = review("collision", 0);
    const newerInput = { ...legacyInput, elapsedMs: 999 };
    const storage = localStorageStub(JSON.stringify([{ profileId: 1, input: legacyInput }]));
    const entryKey = `${storageKey}:entry:${encodeURIComponent("1:collision:0")}`;
    storage.setItem(entryKey, JSON.stringify({ profileId: 1, input: newerInput }));
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();
    const fresh = await import("./useAnswerSubmit");

    expect(JSON.parse(storage.getItem(entryKey)!)).toEqual({ profileId: 1, input: newerInput });
    fresh.resetAnswerSubmitForTests();
  });

  it("preserves callbacks when a peer acknowledges an in-flight entry", async () => {
    const storage = localStorageStub();
    const connection = { onLine: false };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", connection);
    let resolve!: (value: { results: SubmitReviewResponse[] }) => void;
    const submit = vi.spyOn(apiClient, "submitReviews").mockImplementation(() => new Promise((done) => { resolve = done; }));
    const synced = vi.fn();
    setAnswerSubmitProfile(1);
    enqueuePendingReview(1, review("peer-ack", 0), synced);
    connection.onLine = true;
    const flushing = flushPendingReviews(1);
    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const entryKey = `${storageKey}:entry:${encodeURIComponent("1:peer-ack:0")}`;
    const oldValue = storage.getItem(entryKey);
    storage.removeItem(entryKey);
    syncReviewStorageEvent({ key: entryKey, newValue: null, oldValue });
    resolve({ results: [response] });
    await flushing;

    expect(synced).toHaveBeenCalledOnce();
    expect(pendingReviewCount(1)).toBe(0);
  });

  it("does not report failure when a peer acknowledges a lost response", async () => {
    const storage = localStorageStub();
    const connection = { onLine: false };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", connection);
    let reject!: (error: unknown) => void;
    vi.spyOn(apiClient, "submitReviews").mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    setAnswerSubmitProfile(1);
    enqueuePendingReview(1, review("peer-lost", 0));
    connection.onLine = true;
    const flushing = flushPendingReviews(1);
    await vi.waitFor(() => expect(reject).toBeTypeOf("function"));
    const entryKey = `${storageKey}:entry:${encodeURIComponent("1:peer-lost:0")}`;
    const oldValue = storage.getItem(entryKey);
    storage.removeItem(entryKey);
    syncReviewStorageEvent({ key: entryKey, newValue: null, oldValue });
    reject(new Error("response lost"));
    await flushing;

    expect(reviewSyncStatus(1)).toMatchObject({ pendingCount: 0, failed: false });
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

    const stored = storedValues(storage, `${storageKey}:entry:`) as Array<{ input: SubmitReviewRequest }>;
    expect(pendingReviewCount(1)).toBe(500);
    expect(stored).toHaveLength(500);
    expect(stored[0].input.cardIndex).toBe(1);
    expect(storedValues(storage, `${storageKey}:rejected:`)).toHaveLength(1);
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
