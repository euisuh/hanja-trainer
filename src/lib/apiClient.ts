import type { CharacterDetailResponse, CreateSessionRequest, CurriculumResponse, DueReviewsResponse, ProfileResponse, StartSessionRequest, StartSessionResponse, SubmitReviewRequest, SubmitReviewResponse } from "../shared/api";
import type { Track } from "../shared/types";

export class ApiClientError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export const PROFILE_UPDATED_EVENT = "hanja-trainer:profile-updated";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body: unknown = await response.json();
  if (!response.ok) {
    const errorBody = typeof body === "object" && body !== null && "error" in body ? body as { error?: { message?: string } } : null;
    const message = errorBody?.error?.message ?? `Request failed (${response.status})`;
    throw new ApiClientError(response.status, message);
  }
  return body as T;
}

export const apiClient = {
  curriculum: (track: Track, signal?: AbortSignal) => requestJson<CurriculumResponse>(`/api/curriculum?track=${track}`, { signal }),
  character: (key: string, signal?: AbortSignal) => requestJson<CharacterDetailResponse>(`/api/characters/${encodeURIComponent(key)}`, { signal }),
  startSession: (body: StartSessionRequest, signal?: AbortSignal) => requestJson<StartSessionResponse>("/api/session/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  }),
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
};
