import type { CharacterDetailResponse, CreateSessionRequest, CurriculumResponse, DueReviewsResponse, OnboardingStateResponse, PatchSettingsRequest, PinStateResponse, PlacementAnswer, PlacementScoreResponse, ProfileResponse, ProfilesResponse, SettingsResponse, StartSessionRequest, StartSessionResponse, StatsResponse, SubmitReviewRequest, SubmitReviewResponse, UnitStudyResponse, UnitTestAnswer, UnitTestResult } from "../shared/api";
import type { Track } from "../shared/types";

export class ApiClientError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly retryAfter?: number) {
    super(message);
  }
}

export const PROFILE_UPDATED_EVENT = "hanja-trainer:profile-updated";
export const SETTINGS_UPDATED_EVENT = "hanja-trainer:settings-updated";
export const PIN_REQUIRED_EVENT = "hanja-trainer:pin-required";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body: unknown = await response.json();
  if (!response.ok) {
    const errorBody = typeof body === "object" && body !== null && "error" in body ? body as { error?: { code?: string; message?: string }; retryAfter?: number } : null;
    const code = errorBody?.error?.code ?? "request_failed";
    const message = errorBody?.error?.message ?? `Request failed (${response.status})`;
    if (code === "pin_required" || code === "profile_required") window.dispatchEvent(new Event(PIN_REQUIRED_EVENT));
    throw new ApiClientError(response.status, code, message, errorBody?.retryAfter);
  }
  return body as T;
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
  }),
  dueReviews: (tracks: Track[], limit = 50, signal?: AbortSignal) => requestJson<DueReviewsResponse>(`/api/reviews/due?tracks=${tracks.join(",")}&limit=${limit}`, { signal }),
  profile: (signal?: AbortSignal) => requestJson<ProfileResponse>("/api/profile", { signal }),
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
    return result;
  },
  stats: (signal?: AbortSignal) => requestJson<StatsResponse>("/api/stats", { signal }),
  onboardingState: (signal?: AbortSignal) => requestJson<OnboardingStateResponse>("/api/onboarding-state", { signal }),
  profiles: (signal?: AbortSignal) => requestJson<ProfilesResponse>("/api/profiles", { signal }),
  selectProfile: (profileId: number) => requestJson<{ selected: true }>("/api/profiles/select", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileId }) }),
  pinState: (signal?: AbortSignal) => requestJson<PinStateResponse>("/api/pin/state", { signal }),
  unlockPin: (profileId: number, pin: string) => requestJson<{ unlocked: true }>("/api/pin/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileId, pin }) }),
  setPin: (pin: string, currentPin?: string) => requestJson<{ enabled: true }>("/api/pin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin, ...(currentPin ? { currentPin } : {}) }) }),
  removePin: (currentPin: string) => requestJson<{ enabled: false }>("/api/pin", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPin }) }),
};
