import { TRACKS, type Track } from "../../src/shared/types";
import type { ApiErrorBody, SessionMode, StartSessionRequest } from "../../src/shared/api";
import { startSession } from "./cards";
import { getCharacterContent, getCurriculumContent } from "./content";
import { getDueReviews, parseDueRequest, parseReviewRequest, ReviewTargetNotFound, submitReview, submitReviewBatch } from "./reviews";
import { createSession, getProfile, parseSessionRequest } from "./sessions";
import { parsePlacementAnswers, scoreAndSavePlacement } from "./placement";
import { getOnboardingState, getSettings, parseSettingsPatch, patchSettings } from "./settings";
import { getStats } from "./stats";

function error(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } } satisfies ApiErrorBody, { status });
}

function parseTrack(value: string | null): Track | null {
  return value !== null && TRACKS.includes(value as Track) ? value as Track : null;
}

function startRequest(value: unknown): Required<StartSessionRequest> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.mode !== "lesson" && body.mode !== "review" && body.mode !== "placement") return null;
  if (!Array.isArray(body.tracks) || body.tracks.length === 0 || !body.tracks.every((track) => typeof track === "string" && TRACKS.includes(track as Track))) return null;
  if (body.limit !== undefined && (!Number.isInteger(body.limit) || (body.limit as number) < 1 || (body.limit as number) > 50)) return null;
  const mode = body.mode as SessionMode;
  return { mode, tracks: [...new Set(body.tracks as Track[])], limit: (body.limit as number | undefined) ?? (mode === "placement" ? 15 : 8) };
}

export async function routeApiRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  try {
    if (request.method === "GET" && pathname === "/api/health") return Response.json({ ok: true });

    if (request.method === "GET" && pathname === "/api/curriculum") {
      const track = parseTrack(url.searchParams.get("track"));
      if (!track) return error(400, "invalid_track", "track must be kr, jp, or cn");
      return Response.json(await getCurriculumContent(env.DB, track));
    }

    if (request.method === "GET" && pathname.startsWith("/api/characters/")) {
      const rawKey = pathname.slice("/api/characters/".length);
      if (!rawKey || rawKey.includes("/")) return error(400, "invalid_character_key", "character key is required");
      let key: string;
      try {
        key = decodeURIComponent(rawKey);
      } catch {
        return error(400, "invalid_character_key", "character key must be URL encoded");
      }
      const detail = await getCharacterContent(env.DB, key);
      return detail ? Response.json(detail) : error(404, "character_not_found", "character was not found");
    }

    if (request.method === "POST" && pathname === "/api/session/start") {
      let value: unknown;
      try {
        value = await request.json();
      } catch {
        return error(400, "invalid_json", "request body must be valid JSON");
      }
      const input = startRequest(value);
      if (!input) return error(400, "invalid_session_request", "mode, tracks, or limit is invalid");
      return Response.json(await startSession(env.DB, input));
    }

    if (request.method === "POST" && (pathname === "/api/reviews" || pathname === "/api/reviews/batch")) {
      let value: unknown;
      try {
        value = await request.json();
      } catch {
        return error(400, "invalid_json", "request body must be valid JSON");
      }
      if (pathname.endsWith("/batch")) {
        if (!Array.isArray(value) || value.length < 1 || value.length > 100) return error(400, "invalid_review_batch", "body must be an array of 1 to 100 reviews");
        const inputs = value.map(parseReviewRequest);
        if (inputs.some((input) => input === null)) return error(400, "invalid_review", "review fields are invalid");
        return Response.json({ results: await submitReviewBatch(env.DB, inputs as NonNullable<(typeof inputs)[number]>[]) });
      }
      const input = parseReviewRequest(value);
      if (!input) return error(400, "invalid_review", "review fields are invalid");
      return Response.json(await submitReview(env.DB, input));
    }

    if (request.method === "GET" && pathname === "/api/reviews/due") {
      const input = parseDueRequest(url.searchParams);
      if (!input) return error(400, "invalid_due_request", "tracks or limit is invalid");
      return Response.json(await getDueReviews(env.DB, input.tracks, input.limit));
    }

    if (request.method === "POST" && pathname === "/api/sessions") {
      let value: unknown;
      try {
        value = await request.json();
      } catch {
        return error(400, "invalid_json", "request body must be valid JSON");
      }
      const input = parseSessionRequest(value);
      if (!input) return error(400, "invalid_session_summary", "session fields are invalid");
      return Response.json(await createSession(env.DB, input));
    }

    if (request.method === "GET" && pathname === "/api/profile") return Response.json(await getProfile(env.DB));

    if (request.method === "POST" && pathname === "/api/placement/score") {
      let value: unknown;
      try { value = await request.json(); } catch { return error(400, "invalid_json", "request body must be valid JSON"); }
      const answers = parsePlacementAnswers(value);
      if (!answers) return error(400, "invalid_placement", "placement answers are invalid");
      return Response.json(await scoreAndSavePlacement(env.DB, answers));
    }

    if (request.method === "GET" && pathname === "/api/settings") return Response.json(await getSettings(env.DB));

    if (request.method === "PATCH" && pathname === "/api/settings") {
      let value: unknown;
      try { value = await request.json(); } catch { return error(400, "invalid_json", "request body must be valid JSON"); }
      const patch = parseSettingsPatch(value);
      if (!patch) return error(400, "invalid_settings", "settings fields are invalid");
      return Response.json(await patchSettings(env.DB, patch));
    }

    if (request.method === "GET" && pathname === "/api/stats") return Response.json(await getStats(env.DB));
    if (request.method === "GET" && pathname === "/api/onboarding-state") return Response.json(await getOnboardingState(env.DB));

    return error(404, "not_found", "API route was not found");
  } catch (caught) {
    if (caught instanceof ReviewTargetNotFound) return error(404, "character_not_found", "character track was not found");
    console.error(caught);
    return error(500, "internal_error", "request could not be completed");
  }
}
