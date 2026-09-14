import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ enabled: true, values: new Map<string, string>() }));
const preferences = vi.hoisted(() => ({ keys: vi.fn(), get: vi.fn(), set: vi.fn(), remove: vi.fn() }));
const render = vi.hoisted(() => vi.fn());
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native.enabled } }));
vi.mock("@capacitor/preferences", () => ({ Preferences: preferences }));
vi.mock("react-dom/client", () => ({ createRoot: () => ({ render }) }));
vi.mock("../App", () => {
  // main must wait for native restore before importing the module that creates outboxes.
  expect(localStorage.getItem("hanja-trainer:pending-reviews:entry:boot")).toBe("restored");
  return { App: () => null };
});

const reviews = "hanja-trainer:pending-reviews:entry:";
const summaries = "hanja-trainer:pending-session-summaries:entry:";
const rejected = "hanja-trainer:pending-reviews:rejected:";
let values: Map<string, string>;

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  native.enabled = true;
  native.values.clear();
  preferences.keys.mockImplementation(async () => ({ keys: [...native.values.keys()] }));
  preferences.get.mockImplementation(async ({ key }) => ({ value: native.values.get(key) ?? null }));
  preferences.set.mockImplementation(async ({ key, value }) => { native.values.set(key, value); });
  preferences.remove.mockImplementation(async ({ key }) => { native.values.delete(key); });
  values = new Map();
  vi.stubGlobal("localStorage", {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  });
  vi.stubGlobal("navigator", { onLine: false });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("native outbox storage", () => {
  it("keeps the web storage contract without calling Preferences", async () => {
    native.enabled = false;
    const { storedEntries, storeEntry, storeEntryIfAbsent, removeEntries } = await import("../features/session/outboxStorage");
    const { restoreOutboxStorage } = await import("./storage");
    storeEntry(reviews, "a", { profileId: 1 });
    storeEntryIfAbsent(reviews, "a", { profileId: 2 });
    storeEntryIfAbsent(reviews, "b", { profileId: 2 });
    values.set(`${reviews}bad`, "{broken");
    expect(storedEntries(reviews)).toEqual([["a", { profileId: 1 }], ["b", { profileId: 2 }], ["bad", "{broken"]]);
    await restoreOutboxStorage();
    removeEntries(reviews);
    expect(values.size).toBe(0);
    for (const method of Object.values(preferences)) expect(method).not.toHaveBeenCalled();
  });

  it("restores both queues and rejected entries after localStorage is purged", async () => {
    const storage = await import("./storage");
    const review = { profileId: 1, input: { sessionId: "offline", cardIndex: 0, characterKey: "一", track: "kr", correct: true, skipped: false, elapsedMs: 500, mode: "review" } };
    const summary = { profileId: 2, input: { sessionId: "offline", mode: "lesson", startedAt: "2026-09-08T00:00:00.000Z", endedAt: "2026-09-08T00:01:00.000Z", answered: 2, correct: 2, skipped: 0, bestCombo: 2, xp: 25 } };
    const rejection = { profileId: 1, raw: review, errorCode: "invalid_review" };
    storage.set(reviews, "1%3Aoffline%3A0", review);
    storage.set(summaries, "2%3Aoffline", summary);
    storage.set(rejected, "bad", rejection);
    await vi.waitFor(() => expect(native.values.size).toBe(3));
    values.clear();
    await storage.restoreOutboxStorage();

    const answers = await import("../features/session/useAnswerSubmit");
    const sessions = await import("../features/session/useSessionSummary");
    expect(answers.pendingReviewCount(1)).toBe(1);
    expect(answers.pendingReviewCount(2)).toBe(0);
    expect(sessions.pendingSummaryCount(2)).toBe(1);
    expect(sessions.pendingSummaryCount(1)).toBe(0);
    expect(JSON.parse(answers.exportRejectedReviews(1))).toEqual([rejection]);
    answers.discardRejectedReviews(1);
    await vi.waitFor(() => expect(native.values.has(`${rejected}bad`)).toBe(false));
    values.clear();
    await storage.restoreOutboxStorage();
    expect(storage.load(rejected)).toEqual([]);
  });

  it("backs up existing local entries, keeps local conflicts, ignores unrelated data", async () => {
    const storage = await import("./storage");
    native.values.set(`${reviews}same`, "old");
    native.values.set("hanja-session", "unrelated");
    native.values.set("hanja-trainer:pending-reviews-other:entry:x", "unrelated");
    values.set(`${reviews}same`, "new");
    values.set(`${summaries}local-only`, "{malformed");
    storage.set("unrelated:", "local", 1);
    await storage.restoreOutboxStorage();
    expect(values.get(`${reviews}same`)).toBe("new");
    expect(native.values.get(`${reviews}same`)).toBe("new");
    expect(native.values.get(`${summaries}local-only`)).toBe("{malformed");
    expect(values.has("hanja-session")).toBe(false);
    expect(values.has("hanja-trainer:pending-reviews-other:entry:x")).toBe(false);
    expect(native.values.has("unrelated:local")).toBe(false);
  });

  it("orders a delayed write before its removal so acknowledged work stays removed", async () => {
    const storage = await import("./storage");
    let finish!: () => void;
    preferences.set.mockImplementationOnce(({ key, value }) => new Promise<void>((resolve) => {
      finish = () => { native.values.set(key, value); resolve(); };
    }));
    storage.set(reviews, "acknowledged", { profileId: 1 });
    storage.remove(reviews, "acknowledged");
    await vi.waitFor(() => expect(preferences.set).toHaveBeenCalledOnce());
    expect(preferences.remove).not.toHaveBeenCalled();
    finish();
    await vi.waitFor(() => expect(preferences.remove).toHaveBeenCalledOnce());
    await storage.restoreOutboxStorage();
    expect(storage.load(reviews)).toEqual([]);
    expect(native.values.size).toBe(0);
  });

  it("retains local work on a failed native write and allows later writes", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = await import("./storage");
    preferences.set.mockRejectedValueOnce(new Error("native storage unavailable"));
    expect(storage.set(reviews, "failed", 1)).toBe(true);
    expect(storage.set(reviews, "later", 2)).toBe(true);
    await vi.waitFor(() => expect(native.values.get(`${reviews}later`)).toBe("2"));
    expect(values.get(`${reviews}failed`)).toBe("1");
    expect(warning).toHaveBeenCalledOnce();
    await storage.restoreOutboxStorage();
    expect(native.values.get(`${reviews}failed`)).toBe("1");
  });

  it("still mirrors entries when localStorage writes are blocked", async () => {
    const storage = await import("./storage");
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error("quota"); });
    expect(storage.set(reviews, "native-only", 1)).toBe(false);
    await vi.waitFor(() => expect(native.values.get(`${reviews}native-only`)).toBe("1"));
    storage.remove(reviews, "native-only");
    await vi.waitFor(() => expect(native.values.size).toBe(0));
  });

  it("continues restoring after one read fails and preserves the failed backup", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = await import("./storage");
    native.values.set(`${reviews}failed`, "1");
    native.values.set(`${summaries}good`, "2");
    preferences.get.mockRejectedValueOnce(new Error("read failed"));
    await expect(storage.restoreOutboxStorage()).resolves.toBeUndefined();
    expect(values.get(`${summaries}good`)).toBe("2");
    expect(native.values.get(`${reviews}failed`)).toBe("1");
    preferences.keys.mockRejectedValueOnce(new Error("unavailable"));
    await expect(storage.restoreOutboxStorage()).resolves.toBeUndefined();
  });

  it("reads native entries in parallel and backs up only values native lacks", async () => {
    const storage = await import("./storage");
    native.values.set(`${reviews}a`, "1");
    native.values.set(`${reviews}b`, "2");
    values.set(`${reviews}b`, "2");
    values.set(`${summaries}changed`, "new");
    native.values.set(`${summaries}changed`, "old");
    values.set(`${summaries}local-only`, "3");
    const pendingReads: Array<() => void> = [];
    preferences.get.mockImplementation(({ key }) => new Promise((resolve) => {
      pendingReads.push(() => resolve({ value: native.values.get(key) ?? null }));
    }));

    const restoring = storage.restoreOutboxStorage();
    await vi.waitFor(() => expect(preferences.get).toHaveBeenCalledTimes(3));
    pendingReads.forEach((finish) => finish());
    await restoring;

    expect(values.get(`${reviews}a`)).toBe("1");
    expect(values.get(`${summaries}changed`)).toBe("new");
    expect(preferences.set.mock.calls.map(([call]) => call.key).sort()).toEqual([`${summaries}changed`, `${summaries}local-only`]);
  });

  it("keeps a slow backup ahead of a removal made after the timeout", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = await import("./storage");
    values.set(`${reviews}acknowledged`, "1");
    let finishBackup!: () => void;
    preferences.set.mockImplementationOnce(({ key, value }) => new Promise<void>((resolve) => {
      finishBackup = () => { native.values.set(key, value); resolve(); };
    }));

    await storage.restoreOutboxStorage(0);
    await vi.waitFor(() => expect(preferences.set).toHaveBeenCalledOnce());
    storage.remove(reviews, "acknowledged");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(preferences.remove).not.toHaveBeenCalled();
    finishBackup();
    await vi.waitFor(() => expect(preferences.remove).toHaveBeenCalledOnce());
    expect(native.values.has(`${reviews}acknowledged`)).toBe(false);
  });

  it("restores a discarded rejection whose native removal was lost, and can discard it again", async () => {
    let storage = await import("./storage");
    storage.set(rejected, "discarded", { profileId: 1, raw: {}, errorCode: "invalid_review" });
    await vi.waitFor(() => expect(native.values.has(`${rejected}discarded`)).toBe(true));

    // Discarded locally, then the app was killed before the queued native removal ran,
    // and iOS evicted WebView storage before the next launch (accepted limit, see storage.ts).
    values.delete(`${rejected}discarded`);
    values.clear();
    vi.resetModules();
    storage = await import("./storage");
    await storage.restoreOutboxStorage();
    expect(storage.load(rejected)).toEqual([["discarded", { profileId: 1, raw: {}, errorCode: "invalid_review" }]]);

    storage.remove(rejected, "discarded");
    await vi.waitFor(() => expect(native.values.has(`${rejected}discarded`)).toBe(false));
    values.clear();
    await storage.restoreOutboxStorage();
    expect(storage.load(rejected)).toEqual([]);
  });

  it("keeps mirroring after a native write hangs", async () => {
    vi.useFakeTimers();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = await import("./storage");
    preferences.set.mockImplementationOnce(() => new Promise(() => undefined));
    storage.set(reviews, "hung", 1);
    storage.set(reviews, "later", 2);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(native.values.has(`${reviews}later`)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(native.values.get(`${reviews}later`)).toBe("2"));
    expect(warning).toHaveBeenCalledWith("Could not mirror offline work to native storage. (timed out)");
    vi.useRealTimers();
  });

  it("restores before main imports App or renders", async () => {
    let finish!: (value: { keys: string[] }) => void;
    preferences.keys.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    native.values.set(`${reviews}boot`, "restored");
    vi.stubGlobal("document", { getElementById: () => ({}) });
    await import("../main");
    expect(render).not.toHaveBeenCalled();
    finish({ keys: [`${reviews}boot`] });
    await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
  });
});
