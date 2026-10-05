import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../test/schema";
import { PIN_SESSION_MS } from "../auth/pin";
import { routeApiRequest } from "./router";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function result<T>(results: T[], changes = 0): D1Result<T> {
  return { results, success: true, meta: { duration: 0, size_after: 0, rows_read: 0, rows_written: changes, last_row_id: 0, changed_db: changes > 0, changes } };
}

function d1(sqlite: DatabaseSync): D1Database {
  // SAFETY: test adapter implements only D1Database methods exercised by route tests.
  const adapter = Object.create(null) as D1Database;
  adapter.prepare = (query: string) => {
    let values: SQLInputValue[] = [];
    // SAFETY: test adapter assigns every D1PreparedStatement method used by route tests.
    const statement = Object.create(null) as D1PreparedStatement;
    statement.bind = (...bound: unknown[]) => {
      // SAFETY: route tests bind only SQLite-compatible values.
      values = bound as SQLInputValue[];
      return statement;
    };
    statement.first = async <T>() => {
      // SAFETY: SQL query fixture defines returned row shape T.
      return (sqlite.prepare(query).get(...values) as T | undefined) ?? null;
    };
    statement.all = async <T>() => {
      // SAFETY: SQL query fixture defines returned row shape T.
      return result(sqlite.prepare(query).all(...values) as T[]);
    };
    statement.run = async <T>() => result<T>([], Number(sqlite.prepare(query).run(...values).changes));
    return statement;
  };
  adapter.batch = async <T>(statements: D1PreparedStatement[]) => Promise.all(statements.map((statement) => statement.all<T>()));
  return adapter;
}

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  applyMigrations(sqlite);
  // SAFETY: test Env requires only DB binding.
  return { sqlite, env: { DB: d1(sqlite) } as Env };
}

function request(path: string, method: "GET" | "HEAD" | "POST", headers?: HeadersInit) {
  return method === "POST"
    ? new Request(`https://test${path}`, { method, headers, body: "{}" })
    : new Request(`https://test${path}`, { method, headers });
}

function jsonRequest(path: string, method: string, body: JsonValue, headers?: HeadersInit) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("content-type", "application/json");
  return new Request(`https://test${path}`, { method, headers: requestHeaders, body: JSON.stringify(body) });
}

function cookie(response: Response): string {
  return response.headers.get("set-cookie")!.split(";", 1)[0];
}

describe("cross-site API writes", () => {
  const databases: DatabaseSync[] = [];
  afterEach(() => { for (const database of databases.splice(0)) database.close(); });

  it("rejects cross-site browser writes", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    for (const path of ["/api/reviews", "/api/reviews/batch"]) {
      const response = await routeApiRequest(request(path, "POST", { "sec-fetch-site": "cross-site" }), fixture.env);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: { code: "cross_site_request", message: "cross-site requests are not allowed" } });
    }
  });

  it("allows same-origin browser writes even when Origin disagrees", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const response = await routeApiRequest(request("/api/reviews", "POST", { origin: "https://evil.example", "sec-fetch-site": "same-origin" }), fixture.env);
    expect(response.status).not.toBe(403);
  });

  it("rejects cross-origin writes when Sec-Fetch-Site is absent", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const response = await routeApiRequest(request("/api/reviews", "POST", { origin: "https://evil.example" }), fixture.env);
    expect(response.status).toBe(403);
  });

  it("allows non-browser writes with neither origin header", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const response = await routeApiRequest(request("/api/reviews", "POST"), fixture.env);
    expect(response.status).not.toBe(403);
  });

  it("allows cross-site reads", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    expect((await routeApiRequest(request("/api/stats", "GET", { "sec-fetch-site": "cross-site" }), fixture.env)).status).not.toBe(403);
    expect((await routeApiRequest(request("/api/stats", "HEAD", { "sec-fetch-site": "cross-site" }), fixture.env)).status).not.toBe(403);
  });
});

describe("conversation read API", () => {
  const databases: DatabaseSync[] = [];
  afterEach(() => { for (const database of databases.splice(0)) database.close(); });

  function addConversationContent(sqlite: DatabaseSync, due = Date.now() - 1_000) {
    const unitId = Number(sqlite.prepare("INSERT INTO conv_units (ord, title_ko, goal_ko) VALUES (1, '다시 묻기', '상대방에게 다시 말해 달라고 한다')").run().lastInsertRowid);
    const firstChunkId = Number(sqlite.prepare(`
      INSERT INTO conv_chunks (unit_id, ord, ja, kana, ko_cue, register, role, source_kind, source_ref, audio_key)
      VALUES (?, 1, 'もう一度お願いします', 'もういちどおねがいします', '다시 말해 달라고 하기', 'polite', 'say', 'corpus', 'Tatoeba #1', 'c/dfb32afcfa7aaf90')
    `).run(unitId).lastInsertRowid);
    const secondChunkId = Number(sqlite.prepare(`
      INSERT INTO conv_chunks (unit_id, ord, ja, kana, ko_cue, register, role, source_kind, source_ref, audio_key)
      VALUES (?, 2, 'はい', 'はい', '네라고 답하기', 'polite', 'hear', 'corpus', 'Tatoeba #2', 'c/21c07834e26b2ae5')
    `).run(unitId).lastInsertRowid);
    const sceneId = Number(sqlite.prepare("INSERT INTO conv_scenes (unit_id, ord, title_ko, setting_ko, goal_ko) VALUES (?, 1, '카페', '카페 카운터', '다시 묻기')").run(unitId).lastInsertRowid);
    sqlite.prepare("INSERT INTO conv_scene_turns (scene_id, ord, speaker, chunk_ids) VALUES (?, 1, 'npc', ?)")
      .run(sceneId, JSON.stringify([secondChunkId]));
    sqlite.prepare("INSERT INTO conv_scene_turns (scene_id, ord, speaker, chunk_ids) VALUES (?, 2, 'learner', ?)")
      .run(sceneId, JSON.stringify([firstChunkId]));
    const state = sqlite.prepare(`
      INSERT INTO conv_chunk_states (profile_id, chunk_id, role, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, due)
      VALUES (1, ?, ?, 1, 5, 0, 1, 1, 0, 1, ?)
    `);
    state.run(firstChunkId, "say", due + 500);
    state.run(secondChunkId, "hear", due);
    return { unitId, sceneId, firstChunkId, secondChunkId };
  }

  it("requires an authenticated profile", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    addConversationContent(fixture.sqlite);
    fixture.sqlite.prepare("INSERT INTO profile (name) VALUES ('둘')").run();

    const response = await routeApiRequest(request("/api/conv/units", "GET"), fixture.env);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "profile_required", message: "Select a profile" } });
  });

  it("returns shared conversation payloads, missing-unit 404, and due chunks by due date", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const now = Date.now();
    const { unitId, sceneId, firstChunkId, secondChunkId } = addConversationContent(fixture.sqlite, now - 1_000);

    const expectedUnit = { id: unitId, track: "jp", ord: 1, titleKo: "다시 묻기", goalKo: "상대방에게 다시 말해 달라고 한다" };
    expect(await (await routeApiRequest(request("/api/conv/units", "GET"), fixture.env)).json()).toEqual({ units: [expectedUnit] });

    const detail = await (await routeApiRequest(request(`/api/conv/units/${unitId}`, "GET"), fixture.env)).json();
    expect(detail).toEqual({
      unit: expectedUnit,
      chunks: [
        { id: firstChunkId, unitId, ord: 1, ja: "もう一度お願いします", kana: "もういちどおねがいします", koCue: "다시 말해 달라고 하기", register: "polite", role: "say", sourceKind: "corpus", sourceRef: "Tatoeba #1", audioKey: "c/dfb32afcfa7aaf90", audioUrl: "/api/audio/jp/c/dfb32afcfa7aaf90.mp3" },
        { id: secondChunkId, unitId, ord: 2, ja: "はい", kana: "はい", koCue: "네라고 답하기", register: "polite", role: "hear", sourceKind: "corpus", sourceRef: "Tatoeba #2", audioKey: "c/21c07834e26b2ae5", audioUrl: "/api/audio/jp/c/21c07834e26b2ae5.mp3" },
      ],
      scenes: [{
        id: sceneId,
        unitId,
        ord: 1,
        titleKo: "카페",
        settingKo: "카페 카운터",
        goalKo: "다시 묻기",
        turns: [
          { sceneId, ord: 1, speaker: "npc", chunkIds: [secondChunkId] },
          { sceneId, ord: 2, speaker: "learner", chunkIds: [firstChunkId] },
        ],
      }],
    });

    const missing = await routeApiRequest(request("/api/conv/units/999", "GET"), fixture.env);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: { code: "unit_not_found", message: "conversation unit was not found" } });

    expect(await (await routeApiRequest(request("/api/conv/due", "GET"), fixture.env)).json()).toEqual({
      chunks: [
        { id: secondChunkId, unitId, ord: 2, ja: "はい", kana: "はい", koCue: "네라고 답하기", register: "polite", role: "hear", sourceKind: "corpus", sourceRef: "Tatoeba #2", audioKey: "c/21c07834e26b2ae5", audioUrl: "/api/audio/jp/c/21c07834e26b2ae5.mp3", stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 1, learningSteps: 0, reps: 1, lapses: 0, state: 1, lastReview: null, due: now - 1_000, correctCount: 0, totalCount: 0 },
        { id: firstChunkId, unitId, ord: 1, ja: "もう一度お願いします", kana: "もういちどおねがいします", koCue: "다시 말해 달라고 하기", register: "polite", role: "say", sourceKind: "corpus", sourceRef: "Tatoeba #1", audioKey: "c/dfb32afcfa7aaf90", audioUrl: "/api/audio/jp/c/dfb32afcfa7aaf90.mp3", stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 1, learningSteps: 0, reps: 1, lapses: 0, state: 1, lastReview: null, due: now - 500, correctCount: 0, totalCount: 0 },
      ],
    });

    const attempt = fixture.sqlite.prepare(`
      INSERT INTO conv_attempts (profile_id, client_attempt_id, chunk_id, role, grade, answered_at, loop, input, hints, replays)
      VALUES (1, ?, ?, 'say', ?, ?, 'drill', 'voice', 0, 0)
    `);
    attempt.run("first-day", firstChunkId, 3, Date.UTC(2026, 9, 4));
    attempt.run("second-day", firstChunkId, 1, Date.UTC(2026, 9, 5));
    attempt.run("again", firstChunkId, 1, Date.UTC(2026, 9, 5, 1));
    expect(await (await routeApiRequest(request("/api/conv/progress", "GET"), fixture.env)).json()).toEqual({
      units: [{ id: unitId, ord: 1, titleKo: "다시 묻기", goalKo: "상대방에게 다시 말해 달라고 한다", phraseCount: 1, completedPhraseCount: 1 }],
      phrases: [{ id: firstChunkId, unitId, ord: 1, ja: "もう一度お願いします", kana: "もういちどおねがいします", koCue: "다시 말해 달라고 하기", spokenDays: 2, againCount: 2 }],
    });
  });
});

describe("profile expectations", () => {
  const databases: DatabaseSync[] = [];
  afterEach(() => { for (const database of databases.splice(0)) database.close(); });

  it("rejects stale, missing, and invalid mutation expectations without writes", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const secondId = Number(fixture.sqlite.prepare("INSERT INTO profile (name) VALUES ('둘')").run().lastInsertRowid);
    const selected = await routeApiRequest(jsonRequest("/api/profiles/select", "POST", { profileId: secondId }), fixture.env);
    const session = cookie(selected);
    const staleHeaders = { cookie: session, "x-hanja-profile-id": "1" };
    const profileBefore = fixture.sqlite.prepare("SELECT id, enabled_tracks, daily_goal, xp, onboarded_at FROM profile ORDER BY id").all();

    for (const mutation of [
      jsonRequest("/api/reviews/batch", "POST", [{ sessionId: "stale", cardIndex: 0, characterKey: "一", track: "kr", correct: true, skipped: false, elapsedMs: 1, mode: "review" }], staleHeaders),
      jsonRequest("/api/sessions", "POST", { mode: "lesson", startedAt: new Date(0).toISOString(), endedAt: new Date(0).toISOString(), answered: 1, correct: 1, skipped: 0, bestCombo: 1, xp: 10 }, staleHeaders),
      jsonRequest("/api/placement/score", "POST", { answers: [] }, staleHeaders),
      jsonRequest("/api/settings", "PATCH", { dailyGoal: 40 }, staleHeaders),
      jsonRequest("/api/profiles", "POST", { name: "셋" }, staleHeaders),
      jsonRequest("/api/pin", "POST", { pin: "1234" }, staleHeaders),
    ]) {
      const response = await routeApiRequest(mutation, fixture.env);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: { code: "profile_changed", message: "The active profile changed" } });
      expect(response.headers.get("set-cookie")).toBeNull();
    }

    for (const expectation of [undefined, "bad", "0"]) {
      const headers = new Headers({ cookie: session });
      if (expectation !== undefined) headers.set("x-hanja-profile-id", expectation);
      expect((await routeApiRequest(jsonRequest("/api/settings", "PATCH", { dailyGoal: 40 }, headers), fixture.env)).status).toBe(409);
    }
    expect(fixture.sqlite.prepare("SELECT id, enabled_tracks, daily_goal, xp, onboarded_at FROM profile ORDER BY id").all()).toEqual(profileBefore);
    for (const table of ["review_log", "review_states", "review_submissions", "sessions", "placement_results"]) {
      expect(fixture.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get(), table).toEqual({ count: 0 });
    }
  });

  it("allows matching mutations and expectation-free profile bootstrap", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    expect((await routeApiRequest(new Request("https://test/api/profile"), fixture.env)).status).toBe(200);
    const secondId = Number(fixture.sqlite.prepare("INSERT INTO profile (name) VALUES ('둘')").run().lastInsertRowid);
    const session = cookie(await routeApiRequest(jsonRequest("/api/profiles/select", "POST", { profileId: secondId }), fixture.env));

    const response = await routeApiRequest(jsonRequest("/api/settings", "PATCH", { dailyGoal: 60 }, { cookie: session, "x-hanja-profile-id": String(secondId) }), fixture.env);
    expect(response.status).toBe(200);
    expect(fixture.sqlite.prepare("SELECT id, daily_goal FROM profile ORDER BY id").all()).toEqual([{ id: 1, daily_goal: 40 }, { id: secondId, daily_goal: 60 }]);

    const headers = { cookie: session, "x-hanja-profile-id": String(secondId) };
    const [tracks, sound] = await Promise.all([
      routeApiRequest(jsonRequest("/api/settings", "PATCH", { enabledTracks: ["jp"] }, headers), fixture.env),
      routeApiRequest(jsonRequest("/api/settings", "PATCH", { soundMode: "off" }, headers), fixture.env),
    ]);
    expect([tracks.status, sound.status]).toEqual([200, 200]);
    expect(fixture.sqlite.prepare("SELECT enabled_tracks, sound_mode FROM profile WHERE id = ?").get(secondId)).toEqual({ enabled_tracks: '["jp"]', sound_mode: "off" });
  });
});

describe("bearer session tokens", () => {
  const databases: DatabaseSync[] = [];
  afterEach(() => { for (const database of databases.splice(0)) database.close(); });
  const now = 1_800_000_000_000;

  function twoProfiles() {
    const fixture = setup(); databases.push(fixture.sqlite);
    const secondId = Number(fixture.sqlite.prepare("INSERT INTO profile (name) VALUES ('둘')").run().lastInsertRowid);
    return { ...fixture, secondId };
  }

  async function bearerSelect(env: Env, profileId: number, at = now) {
    const response = await routeApiRequest(jsonRequest("/api/profiles/select", "POST", { profileId }, { "x-hanja-session-transport": "bearer" }), env, at);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    // SAFETY: selected profile response is asserted as 200 by router contract.
    const body = await response.json() as { selected: true; sessionToken: string };
    expect(body).toEqual({ selected: true, sessionToken: expect.stringMatching(new RegExp(`^${profileId}\\.\\d+\\.[\\w-]+$`, "u")) });
    return body.sessionToken;
  }

  it("issues a token on explicit bearer transport and authenticates with it", async () => {
    const { env, secondId } = twoProfiles();
    const token = await bearerSelect(env, secondId);

    const response = await routeApiRequest(new Request("https://test/api/profile", { headers: { authorization: `Bearer ${token}` } }), env, now + 1_000);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: secondId });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    const renewed = response.headers.get("x-hanja-session");
    expect(renewed).toMatch(new RegExp(`^${secondId}\\.${now + 1_000 + PIN_SESSION_MS}\\.`, "u"));
    expect(renewed).not.toBe(token);
    expect((await routeApiRequest(new Request("https://test/api/profile", { headers: { authorization: `Bearer ${renewed}` } }), env, now + 2_000)).status).toBe(200);
  });

  it("keeps the web cookie flow unchanged and never exposes a token to it", async () => {
    const { env, secondId } = twoProfiles();
    const selected = await routeApiRequest(jsonRequest("/api/profiles/select", "POST", { profileId: secondId }), env, now);
    expect(await selected.json()).toEqual({ selected: true });
    const session = cookie(selected);

    const response = await routeApiRequest(new Request("https://test/api/profile", { headers: { cookie: session, "x-hanja-session-transport": "bearer" } }), env, now);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-hanja-session")).toBeNull();
    expect(response.headers.get("set-cookie")).toContain("hanja_session=");
  });

  it("rejects tampered, expired, malformed, and non-bearer authorization without fallback", async () => {
    const { env, secondId } = twoProfiles();
    const token = await bearerSelect(env, secondId);
    const session = cookie(await routeApiRequest(jsonRequest("/api/profiles/select", "POST", { profileId: secondId }), env, now));
    const signatureStart = token.lastIndexOf(".") + 1;
    // Flip a middle signature character; the final base64url character only carries padding bits.
    const tampered = `${token.slice(0, signatureStart + 5)}${token[signatureStart + 5] === "A" ? "B" : "A"}${token.slice(signatureStart + 6)}`;
    const attempts: Array<[string, number]> = [
      [`Bearer ${tampered}`, now],
      [`Bearer ${token}`, now + PIN_SESSION_MS],
      [`Bearer ${secondId}.${now + PIN_SESSION_MS}`, now],
      ["Bearer", now],
      [`Basic ${token}`, now],
    ];
    for (const [authorization, at] of attempts) {
      const response = await routeApiRequest(new Request("https://test/api/profile", { headers: { authorization, cookie: session } }), env, at);
      expect(response.status, authorization).toBe(401);
      expect(await response.json()).toEqual({ error: { code: "profile_required", message: "Select a profile" } });
    }
  });

  it("does not auto-select the lone PIN-less profile for a bearer attempt", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    expect((await routeApiRequest(new Request("https://test/api/profile"), fixture.env, now)).status).toBe(200);
    expect((await routeApiRequest(new Request("https://test/api/profile", { headers: { authorization: "Bearer garbage" } }), fixture.env, now)).status).toBe(401);
  });

  it("revokes outstanding bearer tokens when the PIN changes", async () => {
    const { env, secondId } = twoProfiles();
    const token = await bearerSelect(env, secondId);
    const setPin = await routeApiRequest(jsonRequest("/api/pin", "POST", { pin: "1234" }, { authorization: `Bearer ${token}`, "x-hanja-profile-id": String(secondId) }), env, now);
    expect(setPin.status).toBe(200);
    expect((await routeApiRequest(new Request("https://test/api/profile", { headers: { authorization: `Bearer ${token}` } }), env, now)).status).toBe(401);

    const unlocked = await routeApiRequest(jsonRequest("/api/pin/unlock", "POST", { profileId: secondId, pin: "1234" }, { "x-hanja-session-transport": "bearer" }), env, now);
    expect(unlocked.headers.get("set-cookie")).toBeNull();
    // SAFETY: PIN unlock returns sessionToken on this successful test path.
    const { sessionToken } = await unlocked.json() as { sessionToken: string };
    expect((await routeApiRequest(new Request("https://test/api/profile", { headers: { authorization: `Bearer ${sessionToken}` } }), env, now)).status).toBe(200);
  });
});

describe("native app origins", () => {
  const databases: DatabaseSync[] = [];
  afterEach(() => { for (const database of databases.splice(0)) database.close(); });
  const now = 1_800_000_000_000;
  const nativeOrigins = ["capacitor://localhost", "https://localhost"];

  function nativeHeaders(origin: string, extra: Record<string, string> = {}) {
    return { origin, "sec-fetch-site": "cross-site", ...extra };
  }

  it("answers preflights only for Capacitor origins", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    for (const origin of nativeOrigins) {
      const response = await routeApiRequest(new Request("https://test/api/reviews/batch", { method: "OPTIONS", headers: { origin, "access-control-request-method": "POST" } }), fixture.env);
      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe(origin);
      expect(response.headers.get("access-control-allow-headers")).toBe("authorization, content-type, x-hanja-profile-id, x-hanja-session-transport");
      expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    }
    for (const origin of ["https://evil.example", "http://localhost", "capacitor://evil", "null"]) {
      const response = await routeApiRequest(new Request("https://test/api/reviews/batch", { method: "OPTIONS", headers: { origin, "sec-fetch-site": "cross-site" } }), fixture.env);
      expect(response.headers.get("access-control-allow-origin"), origin).toBeNull();
    }
  });

  it("signs in with a body token and never sets a cookie for native origins", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const secondId = Number(fixture.sqlite.prepare("INSERT INTO profile (name) VALUES ('둘')").run().lastInsertRowid);
    for (const origin of nativeOrigins) {
      const selected = await routeApiRequest(jsonRequest("/api/profiles/select", "POST", { profileId: secondId }, nativeHeaders(origin)), fixture.env, now);
      expect(selected.status).toBe(200);
      expect(selected.headers.get("set-cookie")).toBeNull();
      expect(selected.headers.get("access-control-allow-origin")).toBe(origin);
      // SAFETY: native profile select returns sessionToken on this successful test path.
      const { sessionToken } = await selected.json() as { sessionToken: string };

      const patched = await routeApiRequest(jsonRequest("/api/settings", "PATCH", { dailyGoal: 60 }, nativeHeaders(origin, { authorization: `Bearer ${sessionToken}`, "x-hanja-profile-id": String(secondId) })), fixture.env, now + 1_000);
      expect(patched.status).toBe(200);
      expect(patched.headers.get("access-control-allow-origin")).toBe(origin);
      expect(patched.headers.get("access-control-expose-headers")).toBe("x-hanja-session, retry-after");
      expect(patched.headers.get("x-hanja-session")).toMatch(new RegExp(`^${secondId}\\.`, "u"));
      expect(patched.headers.get("set-cookie")).toBeNull();

      const ended = await routeApiRequest(new Request("https://test/api/session/end", { method: "POST", headers: nativeHeaders(origin) }), fixture.env, now);
      expect(ended.status).toBe(200);
      expect(ended.headers.get("set-cookie")).toBeNull();
    }
  });

  it("ignores cookies and the lone PIN-less profile for native origins", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    for (const origin of nativeOrigins) {
      const lone = await routeApiRequest(new Request("https://test/api/profile", { headers: nativeHeaders(origin) }), fixture.env, now);
      expect(lone.status).toBe(401);
      expect(lone.headers.get("access-control-allow-origin")).toBe(origin);
    }
    const secondId = Number(fixture.sqlite.prepare("INSERT INTO profile (name) VALUES ('둘')").run().lastInsertRowid);
    const session = cookie(await routeApiRequest(jsonRequest("/api/profiles/select", "POST", { profileId: secondId }), fixture.env, now));
    for (const origin of nativeOrigins) {
      const response = await routeApiRequest(jsonRequest("/api/sessions", "POST", { mode: "lesson", startedAt: new Date(0).toISOString(), endedAt: new Date(0).toISOString(), answered: 1, correct: 1, skipped: 0, bestCombo: 1, xp: 10 }, nativeHeaders(origin, { cookie: session, "x-hanja-profile-id": String(secondId) })), fixture.env, now);
      expect(response.status).toBe(401);
    }
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM sessions").get()).toEqual({ count: 0 });
  });

  it("adds no CORS headers for other origins", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const response = await routeApiRequest(request("/api/reviews", "POST", { origin: "https://evil.example", "sec-fetch-site": "cross-site" }), fixture.env);
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    const read = await routeApiRequest(request("/api/profiles", "GET", { origin: "https://evil.example", "sec-fetch-site": "cross-site" }), fixture.env);
    expect(read.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("client compatibility config", () => {
  const databases: DatabaseSync[] = [];
  afterEach(() => { for (const database of databases.splice(0)) database.close(); });

  it("is public, needs no profile, and carries CORS for native origins", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    fixture.sqlite.prepare("INSERT INTO profile (name) VALUES ('둘')").run();
    const web = await routeApiRequest(new Request("https://test/api/client-config"), fixture.env);
    expect(web.status).toBe(200);
    expect(await web.json()).toEqual({ minCompatVersion: 1 });
    expect(web.headers.get("set-cookie")).toBeNull();

    const native = await routeApiRequest(new Request("https://test/api/client-config", { headers: { origin: "capacitor://localhost", "sec-fetch-site": "cross-site" } }), fixture.env);
    expect(native.status).toBe(200);
    expect(native.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
  });
});
