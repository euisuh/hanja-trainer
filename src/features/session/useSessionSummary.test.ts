import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, apiClient } from "../../lib/apiClient";
import type { CreateSessionRequest, ProfileResponse } from "../../shared/api";
import { discardRejectedSummaries, enqueuePendingSummary, exportRejectedSummaries, flushPendingSummaries, pendingSummaryCount, resetSessionSummaryForTests, retryPendingSummaries, sessionSummaryStatus, setSessionSummaryProfile, syncSummaryStorageEvent } from "./useSessionSummary";

const storageKey = "hanja-trainer:pending-session-summaries";
const profile = { id: 1, name: "나", isAdmin: true, xp: 25, streak: 1, longestStreak: 1, todayXp: 25, goal: 40, enabledTracks: ["kr"] } satisfies ProfileResponse;

function summary(sessionId: string): CreateSessionRequest & { sessionId: string } {
  return { sessionId, mode: "lesson", startedAt: "2026-09-08T00:00:00.000Z", endedAt: "2026-09-08T00:01:00.000Z", answered: 2, correct: 2, skipped: 0, bestCombo: 2, xp: 25 };
}

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

describe("durable session summaries", () => {
  afterEach(() => {
    resetSessionSummaryForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.resetModules();
  });

  it("quarantines a permanent rejection, saves later results and preserves the original across reload", async () => {
    const storage = localStorageStub();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", { onLine: true });
    const create = vi.spyOn(apiClient, "createSession")
      .mockRejectedValueOnce(new ApiClientError(400, "invalid_session_summary", "invalid"))
      .mockResolvedValue(profile);
    enqueuePendingSummary(1, summary("rejected"));
    enqueuePendingSummary(1, summary("valid"));
    enqueuePendingSummary(2, summary("other-owner"));

    setSessionSummaryProfile(1);

    await vi.waitFor(() => expect(pendingSummaryCount(1)).toBe(0));
    expect(create.mock.calls.map(([owner, input]) => [owner, input.sessionId])).toEqual([[1, "rejected"], [1, "valid"]]);
    expect(sessionSummaryStatus(1)).toMatchObject({ pendingCount: 0, rejectedCount: 1, pendingFailed: false, errorCode: "invalid_session_summary" });
    expect(sessionSummaryStatus(2)).toMatchObject({ pendingCount: 1, rejectedCount: 0, failed: false });
    const quarantined = [{ profileId: 1, raw: { profileId: 1, input: summary("rejected") }, errorCode: "invalid_session_summary" }];
    expect(JSON.parse(exportRejectedSummaries(1))).toEqual(quarantined);
    expect(JSON.parse(exportRejectedSummaries(2))).toEqual([]);

    vi.resetModules();
    const fresh = await import("./useSessionSummary");
    expect(fresh.pendingSummaryCount(1)).toBe(0);
    expect(fresh.pendingSummaryCount(2)).toBe(1);
    expect(JSON.parse(fresh.exportRejectedSummaries(1))).toEqual(quarantined);
    expect(fresh.sessionSummaryStatus(1).errorCode).toBe("invalid_session_summary");
    fresh.discardRejectedSummaries(2);
    expect(fresh.sessionSummaryStatus(1).rejectedCount).toBe(1);
    fresh.discardRejectedSummaries(1);
    expect(fresh.sessionSummaryStatus(1).rejectedCount).toBe(0);
    expect(fresh.pendingSummaryCount(2)).toBe(1);
    fresh.resetSessionSummaryForTests();
  });

  it.each([
    new ApiClientError(401, "pin_required", "locked"),
    new ApiClientError(403, "access_required", "locked"),
    new ApiClientError(409, "profile_changed", "changed"),
    new ApiClientError(408, "timeout", "timeout"),
    new ApiClientError(429, "rate_limited", "slow"),
    new ApiClientError(503, "unavailable", "unavailable"),
    new Error("network failure"),
    new DOMException("cancelled", "AbortError"),
  ])("keeps recoverable failures pending: %s", async (error) => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", localStorageStub());
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    const create = vi.spyOn(apiClient, "createSession").mockRejectedValue(error);
    enqueuePendingSummary(1, summary("retryable"));
    enqueuePendingSummary(1, summary("later"));
    setSessionSummaryProfile(1);

    await vi.waitFor(() => expect(sessionSummaryStatus(1).pendingFailed).toBe(true));
    expect(sessionSummaryStatus(1)).toMatchObject({ pendingCount: 2, rejectedCount: 0 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("persists before sending and removes only after acknowledgement", async () => {
    const storage = localStorageStub();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", { onLine: true });
    let acknowledge!: (value: ProfileResponse) => void;
    vi.spyOn(apiClient, "createSession").mockImplementation(() => new Promise((resolve) => { acknowledge = resolve; }));

    setSessionSummaryProfile(1);
    enqueuePendingSummary(1, summary("held"));

    expect(storedValues(storage, `${storageKey}:entry:`)).toEqual([{ profileId: 1, input: summary("held") }]);
    expect(pendingSummaryCount(1)).toBe(1);
    acknowledge(profile);
    await vi.waitFor(() => expect(pendingSummaryCount(1)).toBe(0));
    expect(storage.getItem(storageKey)).toBeNull();
  });

  it("does not replace summaries queued by another loaded tab", async () => {
    const storage = localStorageStub();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", { onLine: false });
    vi.resetModules();
    const tabA = await import("./useSessionSummary");
    tabA.enqueuePendingSummary(1, summary("tab-a"));
    vi.resetModules();
    const tabB = await import("./useSessionSummary");
    tabB.enqueuePendingSummary(1, summary("tab-b"));

    expect(storedValues(storage, `${storageKey}:entry:`).map((item: { input: { sessionId: string } }) => item.input.sessionId).sort()).toEqual(["tab-a", "tab-b"]);
    tabA.resetSessionSummaryForTests();
    tabB.resetSessionSummaryForTests();
  });

  it("keeps failed and offline summaries with their owner until that profile returns", async () => {
    const connection = { onLine: false };
    vi.stubGlobal("localStorage", localStorageStub());
    vi.stubGlobal("navigator", connection);
    const create = vi.spyOn(apiClient, "createSession").mockResolvedValue(profile);

    setSessionSummaryProfile(1);
    enqueuePendingSummary(1, summary("profile-a"));
    setSessionSummaryProfile(2);
    enqueuePendingSummary(2, summary("profile-b"));
    connection.onLine = true;
    await flushPendingSummaries(2);

    expect(create).toHaveBeenCalledWith(2, expect.objectContaining({ sessionId: "profile-b" }));
    expect(pendingSummaryCount(1)).toBe(1);
    expect(pendingSummaryCount(2)).toBe(0);

    setSessionSummaryProfile(1);
    await vi.waitFor(() => expect(pendingSummaryCount(1)).toBe(0));
    expect(create).toHaveBeenLastCalledWith(1, expect.objectContaining({ sessionId: "profile-a" }));
  });

  it("does not let a stale authentication failure interrupt the next owner", async () => {
    vi.stubGlobal("localStorage", localStorageStub());
    vi.stubGlobal("navigator", { onLine: true });
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    let rejectFirst!: (reason: unknown) => void;
    const first = new Promise<ProfileResponse>((_resolve, reject) => { rejectFirst = reject; });
    vi.spyOn(apiClient, "createSession").mockReturnValueOnce(first).mockResolvedValueOnce({ ...profile, id: 2 });

    setSessionSummaryProfile(1);
    enqueuePendingSummary(1, summary("profile-a"));
    setSessionSummaryProfile(2);
    enqueuePendingSummary(2, summary("profile-b"));
    rejectFirst(new ApiClientError(409, "profile_changed", "changed"));

    await vi.waitFor(() => expect(pendingSummaryCount(2)).toBe(0));
    expect(pendingSummaryCount(1)).toBe(1);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("rehydrates after reload and replays the same stable summary", async () => {
    const input = summary("restored");
    const storage = localStorageStub(JSON.stringify({ version: 1, pending: [{ profileId: 1, input }], rejected: [] }));
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", { onLine: true });
    vi.resetModules();
    const { apiClient: freshApiClient } = await import("../../lib/apiClient");
    const create = vi.spyOn(freshApiClient, "createSession").mockResolvedValue(profile);
    const fresh = await import("./useSessionSummary");

    fresh.setSessionSummaryProfile(1);

    await vi.waitFor(() => expect(create).toHaveBeenCalledWith(1, input));
    await vi.waitFor(() => expect(storage.getItem(storageKey)).toBeNull());
    fresh.resetSessionSummaryForTests();
  });

  it("honors retry delay and reuses the same summary after a lost response", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", localStorageStub());
    vi.stubGlobal("navigator", { onLine: true });
    const create = vi.spyOn(apiClient, "createSession")
      .mockRejectedValueOnce(new ApiClientError(503, "unavailable", "lost", 30))
      .mockResolvedValueOnce(profile);

    setSessionSummaryProfile(1);
    enqueuePendingSummary(1, summary("lost-response"));
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    await vi.runAllTicks();
    await flushPendingSummaries(1);
    expect(create).toHaveBeenCalledTimes(1);

    retryPendingSummaries(1);
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
  });

  it("resumes immediately when a failed summary owner is reselected", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", localStorageStub());
    vi.stubGlobal("navigator", { onLine: true });
    const create = vi.spyOn(apiClient, "createSession")
      .mockRejectedValueOnce(new ApiClientError(503, "unavailable", "temporary"))
      .mockResolvedValueOnce(profile);

    setSessionSummaryProfile(1);
    enqueuePendingSummary(1, summary("reselected"));
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    setSessionSummaryProfile(2);
    setSessionSummaryProfile(1);

    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(pendingSummaryCount(1)).toBe(0);
  });

  it.each([
    ["malformed", {}],
    ["wrong owner", { ...profile, id: 2 }],
  ])("keeps a summary after a %s acknowledgement", async (_name, response) => {
    const storage = localStorageStub();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("window", new EventTarget());
    const fetch = vi.fn().mockResolvedValue(Response.json(response));
    vi.stubGlobal("fetch", fetch);

    setSessionSummaryProfile(1);
    enqueuePendingSummary(1, summary("bad-ack"));

    await vi.waitFor(() => expect(sessionSummaryStatus(1).failed).toBe(true));
    expect(sessionSummaryStatus(1).errorCode).toBe("invalid_response");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(pendingSummaryCount(1)).toBe(1);
    expect(storedValues(storage, `${storageKey}:entry:`)).toMatchObject([{ profileId: 1, input: { sessionId: "bad-ack" } }]);
  });

  it("preserves malformed stored rows while flushing later valid summaries", async () => {
    const input = summary("valid-after-invalid");
    const invalid = { profileId: 1, input: { sessionId: "invalid" } };
    const storage = localStorageStub(JSON.stringify({ version: 1, pending: [invalid, { profileId: 1, input }], rejected: [] }));
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", { onLine: true });
    vi.resetModules();
    const { apiClient: freshApiClient } = await import("../../lib/apiClient");
    const create = vi.spyOn(freshApiClient, "createSession").mockResolvedValue(profile);
    const fresh = await import("./useSessionSummary");

    fresh.setSessionSummaryProfile(1);

    await vi.waitFor(() => expect(create).toHaveBeenCalledWith(1, input));
    await vi.waitFor(() => expect(fresh.pendingSummaryCount(1)).toBe(0));
    expect(fresh.sessionSummaryStatus(1).rejectedCount).toBe(1);
    expect(storedValues(storage, `${storageKey}:rejected:`)).toMatchObject([{ raw: invalid }]);
    fresh.resetSessionSummaryForTests();
  });

  it("discards a malformed per-entry rejection", async () => {
    const storage = localStorageStub();
    const key = `${storageKey}:rejected:malformed`;
    storage.setItem(key, "null");
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();
    const fresh = await import("./useSessionSummary");

    expect(() => fresh.discardRejectedSummaries(1)).not.toThrow();
    expect(storage.getItem(key)).toBeNull();
    fresh.resetSessionSummaryForTests();
  });

  it("retains a permanently rejected source when quarantine storage is full", async () => {
    const storage = localStorageStub();
    const connection = { onLine: false };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", connection);
    const create = vi.spyOn(apiClient, "createSession").mockRejectedValue(new ApiClientError(400, "invalid_session_summary", "bad"));
    setSessionSummaryProfile(1);
    enqueuePendingSummary(1, summary("quota-rejection"));
    storage.setItem.mockImplementation((key: string) => {
      if (key.includes(":rejected:")) throw new Error("quota exceeded");
    });
    connection.onLine = true;

    await flushPendingSummaries(1);

    expect(create).toHaveBeenCalledTimes(1);
    expect(sessionSummaryStatus(1)).toMatchObject({ pendingCount: 0, rejectedCount: 1 });
    expect(storedValues(storage, `${storageKey}:entry:`)).toHaveLength(1);
    discardRejectedSummaries(1);
    expect(storedValues(storage, `${storageKey}:entry:`)).toEqual([]);
  });

  it("does not let legacy migration overwrite a newer summary", async () => {
    const legacyInput = summary("collision");
    const newerInput = { ...legacyInput, xp: 99 };
    const storage = localStorageStub(JSON.stringify({ version: 1, pending: [{ profileId: 1, input: legacyInput }], rejected: [] }));
    const entryKey = `${storageKey}:entry:${encodeURIComponent("1:collision")}`;
    storage.setItem(entryKey, JSON.stringify({ profileId: 1, input: newerInput }));
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();
    const fresh = await import("./useSessionSummary");

    expect(JSON.parse(storage.getItem(entryKey)!)).toEqual({ profileId: 1, input: newerInput });
    fresh.resetSessionSummaryForTests();
  });

  it("drops only the peer-acknowledged key while another summary is in flight", async () => {
    const storage = localStorageStub();
    const connection = { onLine: false };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", connection);
    let resolve!: (value: ProfileResponse) => void;
    const create = vi.spyOn(apiClient, "createSession").mockImplementation(() => new Promise((done) => { resolve = done; }));
    setSessionSummaryProfile(1);
    enqueuePendingSummary(1, summary("held"));
    enqueuePendingSummary(1, summary("peer-ack"));
    connection.onLine = true;
    const flushing = flushPendingSummaries(1);
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const entryKey = `${storageKey}:entry:${encodeURIComponent("1:peer-ack")}`;
    const oldValue = storage.getItem(entryKey);
    storage.removeItem(entryKey);
    syncSummaryStorageEvent({ key: entryKey, newValue: null, oldValue });
    resolve(profile);
    await flushing;

    expect(create).toHaveBeenCalledTimes(1);
    expect(pendingSummaryCount(1)).toBe(0);
  });

  it("does not report failure when a peer acknowledges a lost response", async () => {
    const storage = localStorageStub();
    const connection = { onLine: false };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", connection);
    let reject!: (error: unknown) => void;
    vi.spyOn(apiClient, "createSession").mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    setSessionSummaryProfile(1);
    enqueuePendingSummary(1, summary("peer-lost"));
    connection.onLine = true;
    const flushing = flushPendingSummaries(1);
    await vi.waitFor(() => expect(reject).toBeTypeOf("function"));
    const entryKey = `${storageKey}:entry:${encodeURIComponent("1:peer-lost")}`;
    const oldValue = storage.getItem(entryKey);
    storage.removeItem(entryKey);
    syncSummaryStorageEvent({ key: entryKey, newValue: null, oldValue });
    reject(new Error("response lost"));
    await flushing;

    expect(sessionSummaryStatus(1)).toMatchObject({ pendingCount: 0, failed: false });
  });
});
