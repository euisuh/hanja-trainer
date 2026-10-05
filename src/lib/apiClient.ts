/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-unsafe-dictionary-type, anti-slop/no-conditional-empty-object-spread -- Existing transport/error boundary predates changed-file lint; this adds one typed endpoint. */
import { PROFILE_EXPECTATION_HEADER, SESSION_TOKEN_HEADER, SESSION_TRANSPORT_HEADER, type CharacterDetailResponse, type ConversationCheckin, type ConversationProgressResponse, type ConversationSessionResponse, type ConversationStatsResponse, type CreateProfileRequest, type CreateSessionRequest, type CurriculumResponse, type DueReviewsResponse, type ManagedProfile, type OnboardingStateResponse, type PatchSettingsRequest, type PinStateResponse, type PlacementAnswer, type PlacementScoreResponse, type ProfileResponse, type ProfilesResponse, type RenameProfileRequest, type SettingsResponse, type StartSessionRequest, type StartSessionResponse, type StatsResponse, type SubmitConversationAttemptRequest, type SubmitConversationAttemptResponse, type SubmitConversationCheckinRequest, type SubmitReviewRequest, type SubmitReviewResponse, type UnitStudyResponse, type UnitTestAnswer, type UnitTestResult } from "../../shared/api";
import { apiUrl } from "../platform/apiUrl";
import { discardSessionToken, getSessionToken, nativeShell, renewSessionToken, setSessionToken } from "../platform/sessionToken";
import { TRACKS, type Track } from "../../shared/types";
import type { ConversationChunk, ConversationScene, ConversationSceneTurn, ConversationUnit } from "../../shared/types";

export type ConversationUnitResponse = {
  unit: ConversationUnit;
  chunks: Array<ConversationChunk & { audioUrl: string }>;
  scenes: Array<ConversationScene & { turns: ConversationSceneTurn[] }>;
};

export class ApiClientError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly retryAfter?: number) {
    super(message);
  }
}

const AUTH_ERROR_CODES = new Set(["pin_required", "profile_required", "profile_changed", "access_required"]);

export function isAuthenticationError(error: unknown): boolean {
  return error instanceof ApiClientError && AUTH_ERROR_CODES.has(error.code);
}

export function isPermanentApiError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError && error.status >= 400 && error.status < 500
    && error.status !== 408 && error.status !== 429 && !isAuthenticationError(error);
}

export function retryDelayMs(error: unknown, attempt: number, random: () => number = Math.random): number | null {
  if (error instanceof DOMException && error.name === "AbortError") return null;
  if (error instanceof ApiClientError && error.status !== 408 && error.status !== 429 && error.status < 500) return null;
  if (!(error instanceof Error)) return null;
  const exponential = Math.min(300_000, 2_000 * 2 ** Math.max(0, Math.min(attempt, 20)));
  const jittered = Math.floor(exponential * (0.5 + Math.min(1, Math.max(0, random())) * 0.5));
  return Math.max(jittered, (error instanceof ApiClientError ? error.retryAfter ?? 0 : 0) * 1_000);
}

export const PROFILE_UPDATED_EVENT = "hanja-trainer:profile-updated";
export const SETTINGS_UPDATED_EVENT = "hanja-trainer:settings-updated";
export const PIN_REQUIRED_EVENT = "hanja-trainer:pin-required";
export const ONBOARDING_COMPLETED_EVENT = "hanja-trainer:onboarding-completed";

const profileRequests = new Map<AbortController, Promise<unknown>>();
let profileRequestsPaused = false;
let activeProfileId: number | null = null;

function retryAfterSeconds(response: Response, body: unknown): number | undefined {
  const header = response.headers.get("retry-after");
  let headerSeconds: number | undefined;
  if (header !== null) {
    const numeric = Number(header);
    if (Number.isFinite(numeric) && numeric >= 0) headerSeconds = numeric;
    else {
      const date = Date.parse(header);
      if (Number.isFinite(date)) headerSeconds = Math.max(0, Math.ceil((date - Date.now()) / 1_000));
    }
  }
  const bodySeconds = typeof body === "object" && body !== null && "retryAfter" in body
    && typeof body.retryAfter === "number" && Number.isFinite(body.retryAfter) && body.retryAfter >= 0
    ? body.retryAfter : undefined;
  if (headerSeconds === undefined) return bodySeconds;
  if (bodySeconds === undefined) return headerSeconds;
  return Math.max(headerSeconds, bodySeconds);
}

export function validProfileResponse(value: unknown, expectedProfileId: number): value is ProfileResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const profile = value as Record<string, unknown>;
  return profile.id === expectedProfileId
    && typeof profile.name === "string"
    && typeof profile.isAdmin === "boolean"
    && ["xp", "todayXp", "goal", "streak", "longestStreak"].every((field) => Number.isSafeInteger(profile[field]) && (profile[field] as number) >= 0)
    && Array.isArray(profile.enabledTracks)
    && profile.enabledTracks.every((track) => TRACKS.some((candidate) => candidate === track));
}

function requestJson<T>(path: string, init?: RequestInit, notifyAuth = true, profileBound = true, expectedProfileId: number | null = profileBound ? activeProfileId : null): Promise<T> {
  if (profileBound && profileRequestsPaused) return Promise.reject(new Error("Profile request was cancelled"));
  const controller = new AbortController();
  const headers = new Headers(init?.headers);
  if (expectedProfileId !== null) headers.set(PROFILE_EXPECTATION_HEADER, String(expectedProfileId));
  const native = nativeShell();
  const sentToken = native ? getSessionToken() : null;
  if (sentToken !== null) headers.set("authorization", `Bearer ${sentToken}`);
  const callerSignal = init?.signal;
  const abort = () => controller.abort();
  if (callerSignal?.aborted) abort();
  else callerSignal?.addEventListener("abort", abort, { once: true });
  const tracked = (async () => {
    const response = await fetch(apiUrl(path), { ...init, headers, signal: controller.signal, ...(native ? { credentials: "omit" as const } : {}) });
    if (sentToken !== null) renewSessionToken(sentToken, response.headers.get(SESSION_TOKEN_HEADER));
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const jsonContent = contentType.includes("application/json") || contentType.includes("+json");
    const text = await response.text();
    let body: unknown;
    if (jsonContent) {
      try {
        body = JSON.parse(text);
      } catch {
        if (response.ok) throw new ApiClientError(502, "invalid_response", "The server returned an invalid response.", retryAfterSeconds(response, null));
      }
    }
    if (!jsonContent) {
      const accessResponse = response.redirected || response.status === 401 || response.status === 403 || response.ok && contentType.includes("text/html");
      const error = accessResponse
        ? new ApiClientError(401, "access_required", "세션을 다시 확인해 주세요.", retryAfterSeconds(response, null))
        : new ApiClientError(response.ok ? 502 : response.status, response.status >= 500 ? "service_unavailable" : "request_failed", `Request failed (${response.status})`, retryAfterSeconds(response, null));
      if (notifyAuth && isAuthenticationError(error)) window.dispatchEvent(new Event(PIN_REQUIRED_EVENT));
      throw error;
    }
    if (!response.ok) {
      const errorBody = typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null
        ? body.error as Record<string, unknown> : null;
      const code = typeof errorBody?.code === "string" ? errorBody.code
        : response.status === 401 || response.status === 403 ? "access_required" : "request_failed";
      const message = typeof errorBody?.message === "string" ? errorBody.message : `Request failed (${response.status})`;
      const error = new ApiClientError(response.status, code, message, retryAfterSeconds(response, body));
      if (sentToken !== null && response.status === 401 && (code === "profile_required" || code === "pin_required")) discardSessionToken(sentToken);
      if (notifyAuth && isAuthenticationError(error)) window.dispatchEvent(new Event(PIN_REQUIRED_EVENT));
      throw error;
    }
    return body as T;
  })().finally(() => {
    callerSignal?.removeEventListener("abort", abort);
    if (profileBound) profileRequests.delete(controller);
  });
  if (profileBound) profileRequests.set(controller, tracked);
  return tracked;
}

export async function pauseProfileRequests(): Promise<void> {
  profileRequestsPaused = true;
  while (profileRequests.size > 0) {
    const active = [...profileRequests.entries()];
    active.forEach(([controller]) => controller.abort());
    await Promise.allSettled(active.map(([, request]) => request));
    await Promise.resolve();
  }
}

export function resumeProfileRequests() {
  profileRequestsPaused = false;
}

export function setApiProfileId(profileId: number | null) {
  activeProfileId = profileId;
}

export function isApiProfileId(profileId: number): boolean {
  return activeProfileId === profileId;
}

function credentialHeaders(): HeadersInit {
  return nativeShell()
    ? { "content-type": "application/json", [SESSION_TRANSPORT_HEADER]: "bearer" }
    : { "content-type": "application/json" };
}

// Sign-in responses carry `sessionToken` only for bearer transport; web keeps the cookie.
function keepSessionToken<T extends object>(body: T): T {
  if (nativeShell() && "sessionToken" in body && typeof body.sessionToken === "string") setSessionToken(body.sessionToken);
  return body;
}

export const apiClient = {
  conversationProgress: (signal?: AbortSignal) => requestJson<ConversationProgressResponse>("/api/conv/progress", { signal }),
  conversationUnit: (unitId: number, signal?: AbortSignal) => requestJson<ConversationUnitResponse>(`/api/conv/units/${unitId}`, { signal }),
  conversationSession: (unitId: number, signal?: AbortSignal) => requestJson<ConversationSessionResponse>(`/api/conv/session?unitId=${unitId}`, { signal }),
  curriculum: (track: Track, signal?: AbortSignal) => requestJson<CurriculumResponse>(`/api/curriculum?track=${track}`, { signal }),
  unitStudy: (unitId: number, signal?: AbortSignal) => requestJson<UnitStudyResponse>(`/api/curriculum/units/${unitId}`, { signal }),
  character: (key: string, signal?: AbortSignal) => requestJson<CharacterDetailResponse>(`/api/characters/${encodeURIComponent(key)}`, { signal }),
  startSession: (body: StartSessionRequest, signal?: AbortSignal) => requestJson<StartSessionResponse>("/api/session/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  }),
  completeUnitTest: async (unitId: number, sessionId: string, answers: UnitTestAnswer[]): Promise<UnitTestResult> => {
    const result = await requestJson<UnitTestResult>(`/api/curriculum/units/${unitId}/test-out`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, answers }),
    });
    window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
    return result;
  },
  submitReviews: (profileId: number, body: SubmitReviewRequest[], signal?: AbortSignal) => requestJson<{ results: SubmitReviewResponse[] }>("/api/reviews/batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  }, false, true, profileId),
  submitConversationAttempts: (profileId: number, body: SubmitConversationAttemptRequest[], signal?: AbortSignal) => requestJson<{ results: SubmitConversationAttemptResponse[] }>("/api/conv/attempts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  }, false, true, profileId),
  saveConversationCheckin: (body: SubmitConversationCheckinRequest, signal?: AbortSignal) => requestJson<ConversationCheckin>("/api/conv/checkins", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  }),
  conversationStats: (signal?: AbortSignal) => requestJson<ConversationStatsResponse>("/api/conv/stats", { signal }),
  dueReviews: (tracks: Track[], limit = 50, signal?: AbortSignal) => requestJson<DueReviewsResponse>(`/api/reviews/due?tracks=${tracks.join(",")}&limit=${limit}`, { signal }),
  profile: (signal?: AbortSignal, notifyAuth = true, expectedProfileId: number | null = activeProfileId) => requestJson<ProfileResponse>("/api/profile", { signal }, notifyAuth, true, expectedProfileId),
  createSession: async (profileId: number, body: CreateSessionRequest): Promise<ProfileResponse> => {
    let superseded = false;
    const markSuperseded = () => { superseded = true; };
    window.addEventListener(PROFILE_UPDATED_EVENT, markSuperseded);
    let profile: unknown;
    try {
      profile = await requestJson<unknown>("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }, false, true, profileId);
    } finally {
      window.removeEventListener(PROFILE_UPDATED_EVENT, markSuperseded);
    }
    if (!validProfileResponse(profile, profileId)) throw new ApiClientError(502, "invalid_response", "The server returned an invalid profile response.");
    window.dispatchEvent(superseded ? new Event(PROFILE_UPDATED_EVENT) : new CustomEvent(PROFILE_UPDATED_EVENT, { detail: profile }));
    return profile;
  },
  settings: (signal?: AbortSignal) => requestJson<SettingsResponse>("/api/settings", { signal }),
  patchSettings: async (body: PatchSettingsRequest, expectedProfileId: number | null = activeProfileId, notify = true): Promise<SettingsResponse> => {
    let settings: SettingsResponse;
    try {
      settings = await requestJson<SettingsResponse>("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, false, true, expectedProfileId);
    } catch (error) {
      if (expectedProfileId === activeProfileId && isAuthenticationError(error)) window.dispatchEvent(new Event(PIN_REQUIRED_EVENT));
      throw error;
    }
    if (notify) {
      window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT, { detail: settings }));
      window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
    }
    return settings;
  },
  scorePlacement: async (answers: PlacementAnswer[]): Promise<PlacementScoreResponse> => {
    const result = await requestJson<PlacementScoreResponse>("/api/placement/score", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers }) });
    window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
    window.dispatchEvent(new Event(ONBOARDING_COMPLETED_EVENT));
    return result;
  },
  stats: (signal?: AbortSignal) => requestJson<StatsResponse>("/api/stats", { signal }),
  onboardingState: (signal?: AbortSignal, notifyAuth = true) => requestJson<OnboardingStateResponse>("/api/onboarding-state", { signal }, notifyAuth),
  clientConfig: (signal?: AbortSignal) => requestJson<unknown>("/api/client-config", { signal }, false, false),
  profiles: (signal?: AbortSignal) => requestJson<ProfilesResponse>("/api/profiles", { signal }, true, false),
  createProfile: (body: CreateProfileRequest) => requestJson<ManagedProfile>("/api/profiles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  renameProfile: async (profileId: number, body: RenameProfileRequest) => {
    const profile = await requestJson<ManagedProfile>(`/api/profiles/${profileId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
    return profile;
  },
  deleteProfile: (profileId: number) => requestJson<{ deleted: true }>(`/api/profiles/${profileId}`, { method: "DELETE" }),
  selectProfile: async (profileId: number) => keepSessionToken(await requestJson<{ selected: true; sessionToken?: string }>("/api/profiles/select", { method: "POST", headers: credentialHeaders(), body: JSON.stringify({ profileId }) }, true, false)),
  endSession: async () => {
    setSessionToken(null);
    return requestJson<{ ended: true }>("/api/session/end", { method: "POST" }, true, false);
  },
  pinState: (signal?: AbortSignal) => requestJson<PinStateResponse>("/api/pin/state", { signal }, true, false),
  unlockPin: async (profileId: number, pin: string) => keepSessionToken(await requestJson<{ unlocked: true; recoveryCode?: string; sessionToken?: string }>("/api/pin/unlock", { method: "POST", headers: credentialHeaders(), body: JSON.stringify({ profileId, pin }) }, true, false)),
  recoverPin: async (profileId: number, code: string) => keepSessionToken(await requestJson<{ recovered: true; sessionToken?: string }>("/api/pin/recover", { method: "POST", headers: credentialHeaders(), body: JSON.stringify({ profileId, code }) }, true, false)),
  setPin: (pin: string, currentPin?: string) => requestJson<{ enabled: true; recoveryCode?: string }>("/api/pin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin, ...(currentPin ? { currentPin } : {}) }) }),
  removePin: (currentPin: string) => requestJson<{ enabled: false }>("/api/pin", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPin }) }),
};
