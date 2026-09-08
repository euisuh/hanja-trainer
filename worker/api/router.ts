import { TRACKS, type Track } from "../../src/shared/types";
import { MAX_REVIEW_BATCH_SIZE, type ApiErrorBody, type SessionMode, type StartSessionRequest } from "../../src/shared/api";
import { ReviewTargetLocked, startSession } from "./cards";
import { getCharacterContent, getCurriculumContent, getUnitStudyContent } from "./content";
import { getDueReviews, parseDueRequest, parseReviewRequest, ReviewTargetNotFound, submitReview, submitReviewBatch } from "./reviews";
import { createSession, getProfile, parseSessionRequest } from "./sessions";
import { parsePlacementAnswers, scoreAndSavePlacement } from "./placement";
import { getOnboardingState, getSettings, parseSettingsPatch, patchSettings } from "./settings";
import { getStats } from "./stats";
import { clearLegacyPinCookie, clearSessionCookie, createSessionCookie, listProfiles, PinError, readOnlyProfile, recoverAdminPin, removeDevicePin, resolveSession, selectProfile, setDevicePin, unlockDevice } from "../auth/pin";
import { completeUnitTest, parseUnitTestSubmission, UnitTestError } from "./unitTest";
import { createProfile, deleteProfile, ProfileError, renameProfile } from "./profiles";

// A browser sets exactly one of these on every request it makes. `curl`, the
// audio generator, and future native clients set neither, so they are allowed:
// this blocks browser-driven cross-site writes, not non-browser callers.
function crossSite(request: Request, url: URL): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null) return fetchSite === "cross-site";
  const origin = request.headers.get("origin");
  return origin !== null && origin !== url.origin;
}

function error(status: number, code: string, message: string, retryAfter?: number): Response {
  return Response.json(
    { error: { code, message }, ...(retryAfter === undefined ? {} : { retryAfter }) } satisfies ApiErrorBody & { retryAfter?: number },
    { status, headers: retryAfter === undefined ? undefined : { "retry-after": String(retryAfter) } },
  );
}

function withCookie(response: Response, cookie: string): Response {
  const headers = new Headers(response.headers);
  headers.append("set-cookie", cookie);
  // Garbage-collect the pre-multi-profile cookie name on every cookie-bearing
  // response so a browser that still holds one doesn't keep sending it forever.
  headers.append("set-cookie", clearLegacyPinCookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function parseTrack(value: string | null): Track | null {
  return value !== null && TRACKS.includes(value as Track) ? value as Track : null;
}

function startRequest(value: unknown): StartSessionRequest & { limit: number } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.mode !== "lesson" && body.mode !== "review" && body.mode !== "level-review" && body.mode !== "placement") return null;
  if (!Array.isArray(body.tracks) || body.tracks.length === 0 || !body.tracks.every((track) => typeof track === "string" && TRACKS.includes(track as Track))) return null;
  if (body.limit !== undefined && (!Number.isInteger(body.limit) || (body.limit as number) < 1 || (body.limit as number) > 50)) return null;
  if (body.unitId !== undefined && (!Number.isInteger(body.unitId) || (body.unitId as number) < 1)) return null;
  if (body.levelOrd !== undefined && (!Number.isInteger(body.levelOrd) || (body.levelOrd as number) < 1)) return null;
  if (body.unitId !== undefined && body.levelOrd !== undefined) return null;
  if (body.testOut !== undefined && body.testOut !== true) return null;
  const mode = body.mode as SessionMode;
  const tracks = [...new Set(body.tracks as Track[])];
  if (mode === "level-review" && (tracks.length !== 1 || (body.levelOrd === undefined) === (body.unitId === undefined))) return null;
  if (body.testOut === true && (mode !== "lesson" || tracks.length !== 1 || body.unitId === undefined || body.levelOrd !== undefined)) return null;
  return {
    mode,
    tracks,
    limit: (body.limit as number | undefined) ?? (mode === "placement" ? 15 : 8),
    ...(body.unitId === undefined ? {} : { unitId: body.unitId as number }),
    ...(body.levelOrd === undefined ? {} : { levelOrd: body.levelOrd as number }),
    ...(body.testOut === true ? { testOut: true as const } : {}),
  };
}

async function dispatchApiRequest(request: Request, env: Env, profileId: number): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  if (request.method === "GET" && pathname === "/api/health") return Response.json({ ok: true });

    if (request.method === "GET" && pathname === "/api/curriculum") {
      const track = parseTrack(url.searchParams.get("track"));
      if (!track) return error(400, "invalid_track", "track must be kr, jp, or cn");
      return Response.json(await getCurriculumContent(env.DB, profileId, track));
    }

    const unitStudyMatch = request.method === "GET" ? pathname.match(/^\/api\/curriculum\/units\/(\d+)$/) : null;
    if (unitStudyMatch) {
      const unitId = Number(unitStudyMatch[1]);
      if (!Number.isSafeInteger(unitId) || unitId < 1) return error(400, "invalid_unit", "unit id is invalid");
      const detail = await getUnitStudyContent(env.DB, unitId);
      return detail ? Response.json(detail) : error(404, "unit_not_found", "curriculum unit was not found");
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
      const detail = await getCharacterContent(env.DB, profileId, key);
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
      return Response.json(await startSession(env.DB, profileId, input));
    }

    const unitTestMatch = request.method === "POST" ? pathname.match(/^\/api\/curriculum\/units\/(\d+)\/test-out$/) : null;
    if (unitTestMatch) {
      const unitId = Number(unitTestMatch[1]);
      if (!Number.isSafeInteger(unitId) || unitId < 1) return error(400, "invalid_unit_test", "unit id is invalid");
      let value: unknown;
      try { value = await request.json(); } catch { return error(400, "invalid_json", "request body must be valid JSON"); }
      const submission = parseUnitTestSubmission(value);
      if (!submission) return error(400, "invalid_unit_test", "unit test submission is invalid");
      return Response.json(await completeUnitTest(env.DB, profileId, unitId, submission.sessionId, submission.answers));
    }

    if (request.method === "POST" && (pathname === "/api/reviews" || pathname === "/api/reviews/batch")) {
      let value: unknown;
      try {
        value = await request.json();
      } catch {
        return error(400, "invalid_json", "request body must be valid JSON");
      }
      if (pathname.endsWith("/batch")) {
        if (!Array.isArray(value) || value.length < 1 || value.length > MAX_REVIEW_BATCH_SIZE) return error(400, "invalid_review_batch", `body must be an array of 1 to ${MAX_REVIEW_BATCH_SIZE} reviews`);
        const inputs = value.map(parseReviewRequest);
        if (inputs.some((input) => input === null)) return error(400, "invalid_review", "review fields are invalid");
        return Response.json({ results: await submitReviewBatch(env.DB, profileId, inputs as NonNullable<(typeof inputs)[number]>[]) });
      }
      const input = parseReviewRequest(value);
      if (!input) return error(400, "invalid_review", "review fields are invalid");
      return Response.json(await submitReview(env.DB, profileId, input));
    }

    if (request.method === "GET" && pathname === "/api/reviews/due") {
      const input = parseDueRequest(url.searchParams);
      if (!input) return error(400, "invalid_due_request", "tracks or limit is invalid");
      return Response.json(await getDueReviews(env.DB, profileId, input.tracks, input.limit));
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
      return Response.json(await createSession(env.DB, profileId, input));
    }

    if (request.method === "GET" && pathname === "/api/profile") return Response.json(await getProfile(env.DB, profileId));

    if (request.method === "POST" && pathname === "/api/placement/score") {
      let value: unknown;
      try { value = await request.json(); } catch { return error(400, "invalid_json", "request body must be valid JSON"); }
      const answers = parsePlacementAnswers(value);
      if (!answers) return error(400, "invalid_placement", "placement answers are invalid");
      return Response.json(await scoreAndSavePlacement(env.DB, profileId, answers));
    }

    if (request.method === "GET" && pathname === "/api/settings") return Response.json(await getSettings(env.DB, profileId));

    if (request.method === "PATCH" && pathname === "/api/settings") {
      let value: unknown;
      try { value = await request.json(); } catch { return error(400, "invalid_json", "request body must be valid JSON"); }
      const patch = parseSettingsPatch(value);
      if (!patch) return error(400, "invalid_settings", "settings fields are invalid");
      return Response.json(await patchSettings(env.DB, profileId, patch));
    }

    if (request.method === "GET" && pathname === "/api/stats") return Response.json(await getStats(env.DB, profileId));
    if (request.method === "GET" && pathname === "/api/onboarding-state") return Response.json(await getOnboardingState(env.DB, profileId));

    if (request.method === "POST" && pathname === "/api/profiles") {
      let value: unknown;
      try { value = await request.json(); } catch { return error(400, "invalid_json", "request body must be valid JSON"); }
      return Response.json(await createProfile(env.DB, profileId, value), { status: 201 });
    }

    const managedProfileMatch = pathname.match(/^\/api\/profiles\/(\d+)$/);
    if (managedProfileMatch && (request.method === "PATCH" || request.method === "DELETE")) {
      const targetId = Number(managedProfileMatch[1]);
      if (!Number.isSafeInteger(targetId) || targetId < 1) return error(400, "invalid_profile", "profile id is invalid");
      if (request.method === "DELETE") {
        await deleteProfile(env.DB, profileId, targetId);
        return Response.json({ deleted: true });
      }
      let value: unknown;
      try { value = await request.json(); } catch { return error(400, "invalid_json", "request body must be valid JSON"); }
      return Response.json(await renameProfile(env.DB, profileId, targetId, value));
    }

  return error(404, "not_found", "API route was not found");
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try { value = await request.json(); } catch { throw new PinError(400, "invalid_json", "request body must be valid JSON"); }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new PinError(400, "invalid_json", "request body must be a JSON object");
  return value as Record<string, unknown>;
}

function profileId(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new PinError(400, "invalid_profile", "profileId must be a positive integer");
  return value as number;
}

export async function routeApiRequest(request: Request, env: Env, now = Date.now()): Promise<Response> {
  try {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD" && crossSite(request, url)) {
      return error(403, "cross_site_request", "cross-site requests are not allowed");
    }
    const { pathname } = url;
    if (request.method === "GET" && pathname === "/api/profiles") {
      return Response.json({ profiles: await listProfiles(env.DB) });
    }
    if (request.method === "GET" && pathname === "/api/pin/state") {
      const record = await resolveSession(env.DB, request.headers.get("cookie"), now) ?? await readOnlyProfile(env.DB);
      if (!record) return error(401, "profile_required", "Select a profile");
      const locked = Boolean(record.pin_locked_until && record.pin_locked_until > now);
      return Response.json({ enabled: Boolean(record.pin_hash), locked, lockedUntil: locked ? record.pin_locked_until : null });
    }
    if (request.method === "POST" && pathname === "/api/pin/unlock") {
      const body = await jsonBody(request);
      const result = await unlockDevice(env.DB, profileId(body.profileId), body.pin, now);
      return withCookie(Response.json({ unlocked: true, ...(result.recoveryCode ? { recoveryCode: result.recoveryCode } : {}) }), result.cookie);
    }
    if (request.method === "POST" && pathname === "/api/pin/recover") {
      const body = await jsonBody(request);
      return withCookie(Response.json({ recovered: true }), await recoverAdminPin(env.DB, profileId(body.profileId), body.code, now));
    }
    if (request.method === "POST" && pathname === "/api/profiles/select") {
      const body = await jsonBody(request);
      return withCookie(Response.json({ selected: true }), await selectProfile(env.DB, profileId(body.profileId), now));
    }
    if (request.method === "POST" && pathname === "/api/session/end") {
      return withCookie(Response.json({ ended: true }), clearSessionCookie);
    }

    const record = await resolveSession(env.DB, request.headers.get("cookie"), now);
    if (!record) return error(401, "profile_required", "Select a profile");

    if (request.method === "POST" && pathname === "/api/pin") {
      const body = await jsonBody(request);
      const recoveryCode = await setDevicePin(env.DB, record.id, body.pin, body.currentPin, now);
      return withCookie(Response.json({ enabled: true, ...(recoveryCode ? { recoveryCode } : {}) }), clearSessionCookie);
    }
    if (request.method === "DELETE" && pathname === "/api/pin") {
      const body = await jsonBody(request);
      await removeDevicePin(env.DB, record.id, body.currentPin, now);
      return withCookie(Response.json({ enabled: false }), clearSessionCookie);
    }

    const response = await dispatchApiRequest(request, env, record.id);
    return record.pin_secret ? withCookie(response, await createSessionCookie(record.id, record.pin_secret, now)) : response;
  } catch (caught) {
    if (caught instanceof PinError) return error(caught.status, caught.code, caught.message, caught.retryAfter);
    if (caught instanceof ProfileError) return error(caught.status, caught.code, caught.message);
    if (caught instanceof UnitTestError) return error(caught.status, caught.code, caught.message);
    if (caught instanceof ReviewTargetLocked) return error(409, "review_target_locked", "This review target is not available yet");
    if (caught instanceof ReviewTargetNotFound) return error(404, "character_not_found", "character track was not found");
    console.error(caught);
    return error(500, "internal_error", "request could not be completed");
  }
}
