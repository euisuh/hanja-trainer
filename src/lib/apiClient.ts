import type { CharacterDetailResponse, CreateProfileRequest, CreateSessionRequest, CurriculumResponse, DueReviewsResponse, ManagedProfile, OnboardingStateResponse, PatchSettingsRequest, PinStateResponse, PlacementAnswer, PlacementScoreResponse, ProfileResponse, ProfilesResponse, RenameProfileRequest, SettingsResponse, StartSessionRequest, StartSessionResponse, StatsResponse, SubmitReviewRequest, SubmitReviewResponse, UnitStudyResponse, UnitTestAnswer, UnitTestResult } from "../shared/api";
import type { Track } from "../shared/types";

export class ApiClientError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly retryAfter?: number) {
    super(message);
  }
}

export const PROFILE_UPDATED_EVENT = "hanja-trainer:profile-updated";
export const SETTINGS_UPDATED_EVENT = "hanja-trainer:settings-updated";
export const PIN_REQUIRED_EVENT = "hanja-trainer:pin-required";
export const ONBOARDING_COMPLETED_EVENT = "hanja-trainer:onboarding-completed";

const profileRequests = new Map<AbortController, Promise<unknown>>();
let profileRequestsPaused = false;

function requestJson<T>(path: string, init?: RequestInit, notifyAuth = true, profileBound = true): Promise<T> {
  if (profileBound && profileRequestsPaused) return Promise.reject(new Error("Profile request was cancelled"));
  const controller = new AbortController();
  const callerSignal = init?.signal;
  const abort = () => controller.abort();
  if (callerSignal?.aborted) abort();
  else callerSignal?.addEventListener("abort", abort, { once: true });
  const tracked = (async () => {
    const response = await fetch(path, { ...init, signal: controller.signal });
    const body: unknown = await response.json();
    if (!response.ok) {
      const errorBody = typeof body === "object" && body !== null && "error" in body ? body as { error?: { code?: string; message?: string }; retryAfter?: number } : null;
      const code = errorBody?.error?.code ?? "request_failed";
      const message = errorBody?.error?.message ?? `Request failed (${response.status})`;
      if (notifyAuth && (code === "pin_required" || code === "profile_required")) window.dispatchEvent(new Event(PIN_REQUIRED_EVENT));
      throw new ApiClientError(response.status, code, message, errorBody?.retryAfter);
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

export const apiClient = {
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
  submitReviews: (body: SubmitReviewRequest[], signal?: AbortSignal) => requestJson<{ results: SubmitReviewResponse[] }>("/api/reviews/batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  }, false),
  dueReviews: (tracks: Track[], limit = 50, signal?: AbortSignal) => requestJson<DueReviewsResponse>(`/api/reviews/due?tracks=${tracks.join(",")}&limit=${limit}`, { signal }),
  profile: (signal?: AbortSignal, notifyAuth = true) => requestJson<ProfileResponse>("/api/profile", { signal }, notifyAuth),
  createSession: async (body: CreateSessionRequest): Promise<ProfileResponse> => {
    const profile = await requestJson<ProfileResponse>("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
    return profile;
  },
  settings: (signal?: AbortSignal) => requestJson<SettingsResponse>("/api/settings", { signal }),
  patchSettings: async (body: PatchSettingsRequest): Promise<SettingsResponse> => {
    const settings = await requestJson<SettingsResponse>("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT, { detail: settings }));
    window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
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
  profiles: (signal?: AbortSignal) => requestJson<ProfilesResponse>("/api/profiles", { signal }, true, false),
  createProfile: (body: CreateProfileRequest) => requestJson<ManagedProfile>("/api/profiles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  renameProfile: async (profileId: number, body: RenameProfileRequest) => {
    const profile = await requestJson<ManagedProfile>(`/api/profiles/${profileId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
    return profile;
  },
  deleteProfile: (profileId: number) => requestJson<{ deleted: true }>(`/api/profiles/${profileId}`, { method: "DELETE" }),
  selectProfile: (profileId: number) => requestJson<{ selected: true }>("/api/profiles/select", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileId }) }, true, false),
  endSession: () => requestJson<{ ended: true }>("/api/session/end", { method: "POST" }, true, false),
  pinState: (signal?: AbortSignal) => requestJson<PinStateResponse>("/api/pin/state", { signal }, true, false),
  unlockPin: (profileId: number, pin: string) => requestJson<{ unlocked: true; recoveryCode?: string }>("/api/pin/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileId, pin }) }, true, false),
  recoverPin: (profileId: number, code: string) => requestJson<{ recovered: true }>("/api/pin/recover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileId, code }) }, true, false),
  setPin: (pin: string, currentPin?: string) => requestJson<{ enabled: true; recoveryCode?: string }>("/api/pin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin, ...(currentPin ? { currentPin } : {}) }) }),
  removePin: (currentPin: string) => requestJson<{ enabled: false }>("/api/pin", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPin }) }),
};
