import type { CharacterDetailResponse, CurriculumResponse, StartSessionRequest, StartSessionResponse } from "../shared/api";
import type { Track } from "../shared/types";

export class ApiClientError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

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
};
