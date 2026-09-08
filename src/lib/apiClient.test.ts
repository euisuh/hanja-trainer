import { afterEach, describe, expect, it, vi } from "vitest";
import { PROFILE_EXPECTATION_HEADER, type SubmitReviewRequest } from "../shared/api";
import { ApiClientError, apiClient, isAuthenticationError, retryDelayMs, setApiProfileId } from "./apiClient";

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
  await apiClient.profile(undefined, false, null);

  expect(headers).toEqual(["1", "1", null]);
  });
});
