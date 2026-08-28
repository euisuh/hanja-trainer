import { TRACKS, type Track } from "../../src/shared/types";
import type { ApiErrorBody, SessionMode, StartSessionRequest } from "../../src/shared/api";
import { startSession } from "./cards";
import { getCharacterContent, getCurriculumContent } from "./content";

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

    return error(404, "not_found", "API route was not found");
  } catch (caught) {
    console.error(caught);
    return error(500, "internal_error", "request could not be completed");
  }
}
