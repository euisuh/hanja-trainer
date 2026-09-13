import { afterEach, describe, expect, it, vi } from "vitest";
import { PROFILE_EXPECTATION_HEADER, type SubmitReviewRequest } from "../../shared/api";
import { getSessionToken, needsExplicitSelection, setSessionToken } from "../platform/sessionToken";
import { ApiClientError, PIN_REQUIRED_EVENT, PROFILE_UPDATED_EVENT, apiClient, isAuthenticationError, retryDelayMs, setApiProfileId } from "./apiClient";

const profile = { id: 1, name: "나", isAdmin: true, xp: 20, todayXp: 10, goal: 40, streak: 2, longestStreak: 3, enabledTracks: ["kr"] } as const;

describe("API response errors", () => {
  afterEach(() => {
    setApiProfileId(null);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reports a redirected HTML login page as authentication required", async () => {
    const response = new Response("<html>Access login</html>", { status: 200, headers: { "content-type": "text/html" } });
    Object.defineProperty(response, "redirected", { value: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(apiClient.profile(undefined, false)).rejects.toMatchObject({ code: "access_required", status: 401 });
  });

  it("reports an HTML 503 and parses Retry-After seconds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Unavailable</html>", {
      status: 503,
      headers: { "content-type": "text/html", "retry-after": "12" },
    })));

    await expect(apiClient.profile(undefined, false)).rejects.toMatchObject({ code: "service_unavailable", status: 503, retryAfter: 12 });
  });

  it("parses Retry-After dates relative to response receipt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T00:00:00Z"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "busy" } }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "Tue, 08 Sep 2026 00:00:20 GMT" },
    })));

    await expect(apiClient.profile(undefined, false)).rejects.toMatchObject({ retryAfter: 20 });
    vi.useRealTimers();
  });

  it("never accepts malformed or HTML success payloads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("<html>ok</html>", { status: 200, headers: { "content-type": "text/html" } })));
    await expect(apiClient.profile(undefined, false)).rejects.toBeInstanceOf(ApiClientError);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("{", { status: 200, headers: { "content-type": "application/json" } })));
    await expect(apiClient.profile(undefined, false)).rejects.toMatchObject({ code: "invalid_response", status: 502 });
  });

  it("normalizes malformed JSON auth errors without hiding PIN feedback", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ error: { code: 123, message: {} } }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ error: { code: "invalid_pin", message: "Wrong PIN" } }, { status: 401 })));

    await expect(apiClient.profile(undefined, false)).rejects.toMatchObject({ code: "access_required", message: "Request failed (401)" });
    await expect(apiClient.profile(undefined, false)).rejects.toMatchObject({ code: "invalid_pin", message: "Wrong PIN" });
  });
});

describe("review retry classification", () => {
  it("uses increasing capped jitter and honors a longer Retry-After", () => {
    const network = new TypeError("fetch failed");
    expect(retryDelayMs(network, 0, () => 0)).toBe(1_000);
    expect(retryDelayMs(network, 1, () => 1)).toBe(4_000);
    expect(retryDelayMs(network, 20, () => 1)).toBe(300_000);
    expect(retryDelayMs(new ApiClientError(429, "rate_limited", "slow", 600), 0, () => 0)).toBe(600_000);
  });

  it("retries only network, timeout, throttling, and service failures", () => {
    expect(retryDelayMs(new ApiClientError(408, "timeout", "timeout"), 0)).not.toBeNull();
    expect(retryDelayMs(new ApiClientError(500, "server", "server"), 0)).not.toBeNull();
    expect(retryDelayMs(new ApiClientError(400, "invalid_review", "bad"), 0)).toBeNull();
    expect(retryDelayMs(new DOMException("cancelled", "AbortError"), 0)).toBeNull();
  });

  it("recognizes profile, PIN, and Access authentication failures", () => {
    for (const code of ["pin_required", "profile_required", "profile_changed", "access_required"]) {
      expect(isAuthenticationError(new ApiClientError(401, code, code))).toBe(true);
    }
    expect(isAuthenticationError(new ApiClientError(400, "invalid_review", "bad"))).toBe(false);
  });
  it("captures the initiating profile and honors an explicit review owner", async () => {
  const headers: Array<string | null> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    headers.push(new Headers(init?.headers).get(PROFILE_EXPECTATION_HEADER));
    return Response.json({ results: [] });
  });
  const review: SubmitReviewRequest = { sessionId: "owner", cardIndex: 0, characterKey: "一", track: "kr", correct: true, skipped: false, elapsedMs: 1, mode: "review" };

  setApiProfileId(1);
  const settings = apiClient.settings();
  setApiProfileId(2);
  await settings;
  await apiClient.submitReviews(1, [review]);
  await apiClient.patchSettings({ dailyGoal: 50 }, 1, false);
  await apiClient.profile(undefined, false, null);

  expect(headers).toEqual(["1", "1", "1", null]);
  });

  it("requests authentication only for the currently active settings owner", async () => {
    const events = new EventTarget();
    const required = vi.fn();
    events.addEventListener(PIN_REQUIRED_EVENT, required);
    vi.stubGlobal("window", events);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ error: { code: "profile_changed", message: "changed" } }, { status: 409 }));
    setApiProfileId(2);

    await expect(apiClient.patchSettings({ dailyGoal: 50 }, 1, false)).rejects.toMatchObject({ code: "profile_changed" });
    expect(required).not.toHaveBeenCalled();
    await expect(apiClient.patchSettings({ dailyGoal: 50 }, 2, false)).rejects.toMatchObject({ code: "profile_changed" });
    expect(required).toHaveBeenCalledOnce();
  });
});

describe("profile update notifications", () => {
  afterEach(() => {
    setApiProfileId(null);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("publishes the validated session profile as event detail", async () => {
    const events: Event[] = [];
    const eventTarget = new EventTarget();
    eventTarget.addEventListener(PROFILE_UPDATED_EVENT, (event) => events.push(event));
    vi.stubGlobal("window", eventTarget);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(profile)));

    await expect(apiClient.createSession(1, { mode: "lesson", startedAt: new Date(0).toISOString(), endedAt: new Date(1).toISOString(), answered: 1, correct: 1, skipped: 0, bestCombo: 1, xp: 10, sessionId: "session" })).resolves.toEqual(profile);

    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(CustomEvent);
    expect((events[0] as CustomEvent).detail).toEqual(profile);
  });

  it("does not notify when a session profile fails owner validation", async () => {
    const eventTarget = new EventTarget();
    const dispatchEvent = vi.spyOn(eventTarget, "dispatchEvent");
    vi.stubGlobal("window", eventTarget);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...profile, id: 2 })));

    await expect(apiClient.createSession(1, { mode: "review", startedAt: new Date(0).toISOString(), endedAt: new Date(1).toISOString(), answered: 0, correct: 0, skipped: 0, bestCombo: 0, xp: 0, sessionId: "session" })).rejects.toMatchObject({ code: "invalid_response" });
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("falls back to a refresh when a newer profile mutation wins the race", async () => {
    const eventTarget = new EventTarget();
    const events: Event[] = [];
    eventTarget.addEventListener(PROFILE_UPDATED_EVENT, (event) => events.push(event));
    vi.stubGlobal("window", eventTarget);
    let resolveResponse!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; })));

    const session = apiClient.createSession(1, { mode: "lesson", startedAt: new Date(0).toISOString(), endedAt: new Date(1).toISOString(), answered: 1, correct: 1, skipped: 0, bestCombo: 1, xp: 10, sessionId: "delayed" });
    eventTarget.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail: { ...profile, goal: 50 } }));
    resolveResponse(Response.json(profile));
    await session;

    expect(events).toHaveLength(2);
    expect(events[1]).not.toBeInstanceOf(CustomEvent);
  });
});

describe("native session token", () => {
  const origin = "https://hanja.uiseoya.com";
  afterEach(() => {
    setSessionToken(null);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function sent(fetchMock: ReturnType<typeof vi.fn>, call: number) {
    const [url, init] = fetchMock.mock.calls[call] as [string, RequestInit];
    return { url, init, headers: new Headers(init.headers) };
  }

  it("keeps the sign-in token and sends it as a bearer header without cookies", async () => {
    vi.stubEnv("VITE_API_ORIGIN", origin);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ selected: true, sessionToken: "2.100.sig" }))
      .mockResolvedValueOnce(Response.json(profile));
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.selectProfile(2);
    const select = sent(fetchMock, 0);
    expect(select.url).toBe(`${origin}/api/profiles/select`);
    expect(select.headers.get("x-hanja-session-transport")).toBe("bearer");
    expect(select.headers.get("authorization")).toBeNull();
    expect(getSessionToken()).toBe("2.100.sig");

    await apiClient.profile(undefined, false, null);
    const read = sent(fetchMock, 1);
    expect(read.headers.get("authorization")).toBe("Bearer 2.100.sig");
    expect(read.init.credentials).toBe("omit");
  });

  it("stores tokens from PIN unlock and recovery", async () => {
    vi.stubEnv("VITE_API_ORIGIN", origin);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ unlocked: true, recoveryCode: "ABCDEFGHJK", sessionToken: "1.100.unlock" }))
      .mockResolvedValueOnce(Response.json({ recovered: true, sessionToken: "1.100.recover" })));

    await expect(apiClient.unlockPin(1, "1234")).resolves.toMatchObject({ recoveryCode: "ABCDEFGHJK" });
    expect(getSessionToken()).toBe("1.100.unlock");
    await apiClient.recoverPin(1, "ABCDEFGHJK");
    expect(getSessionToken()).toBe("1.100.recover");
  });

  it("replaces the token with a renewal only while the sent token is current", async () => {
    vi.stubEnv("VITE_API_ORIGIN", origin);
    setSessionToken("1.100.old");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(profile, { headers: { "x-hanja-session": "1.200.new" } })));
    await apiClient.profile(undefined, false, null);
    expect(getSessionToken()).toBe("1.200.new");

    let resolveResponse!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; })));
    const late = apiClient.profile(undefined, false, null);
    setSessionToken(null);
    resolveResponse(Response.json(profile, { headers: { "x-hanja-session": "1.300.late" } }));
    await late;
    expect(getSessionToken()).toBeNull();
  });

  it("clears the token when the session ends", async () => {
    vi.stubEnv("VITE_API_ORIGIN", origin);
    setSessionToken("1.100.sig");
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ ended: true }));
    vi.stubGlobal("fetch", fetchMock);
    await apiClient.endSession();
    expect(getSessionToken()).toBeNull();
    expect(sent(fetchMock, 0).headers.get("authorization")).toBeNull();
  });

  it("leaves the web cookie flow untouched", async () => {
    setSessionToken("1.100.stray");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ selected: true, sessionToken: "2.100.ignored" }))
      .mockResolvedValueOnce(Response.json(profile, { headers: { "x-hanja-session": "2.200.ignored" } }));
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.selectProfile(2);
    await apiClient.profile(undefined, false, null);
    expect(sent(fetchMock, 0).url).toBe("/api/profiles/select");
    expect(sent(fetchMock, 0).headers.get("x-hanja-session-transport")).toBeNull();
    expect(sent(fetchMock, 1).headers.get("authorization")).toBeNull();
    expect(sent(fetchMock, 1).init.credentials).toBeUndefined();
    expect(getSessionToken()).toBe("1.100.stray");
  });

  it("selects the lone PIN-less profile explicitly only in a native shell without a token", () => {
    expect(needsExplicitSelection({ hasPin: false })).toBe(false);
    vi.stubEnv("VITE_API_ORIGIN", origin);
    expect(needsExplicitSelection({ hasPin: false })).toBe(true);
    expect(needsExplicitSelection({ hasPin: true })).toBe(false);
    setSessionToken("1.100.sig");
    expect(needsExplicitSelection({ hasPin: false })).toBe(false);
  });
});
