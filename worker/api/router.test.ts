import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../test/schema";
import { PIN_SESSION_MS } from "../auth/pin";
import { routeApiRequest } from "./router";

function result<T>(results: T[], changes = 0): D1Result<T> {
  return { results, success: true, meta: { duration: 0, size_after: 0, rows_read: 0, rows_written: changes, last_row_id: 0, changed_db: changes > 0, changes } };
}

function d1(sqlite: DatabaseSync): D1Database {
  const adapter = Object.create(null) as D1Database;
  adapter.prepare = (query: string) => {
    let values: SQLInputValue[] = [];
    const statement = Object.create(null) as D1PreparedStatement;
    statement.bind = (...bound: unknown[]) => {
      values = bound.map((value) => typeof value === "string" || typeof value === "number" || typeof value === "bigint" || value === null ? value : (() => { throw new Error(`Unsupported binding: ${String(value)}`); })());
      return statement;
    };
    statement.first = async <T>() => (sqlite.prepare(query).get(...values) as T | undefined) ?? null;
    statement.all = async <T>() => result(sqlite.prepare(query).all(...values) as T[]);
    statement.run = async <T>() => result<T>([], Number(sqlite.prepare(query).run(...values).changes));
    return statement;
  };
  adapter.batch = async <T>(statements: D1PreparedStatement[]) => Promise.all(statements.map((statement) => statement.all<T>()));
  return adapter;
}

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  applyMigrations(sqlite);
  return { sqlite, env: { DB: d1(sqlite) } as Env };
}

function request(path: string, method: "GET" | "HEAD" | "POST", headers?: HeadersInit) {
  return new Request(`https://test${path}`, { method, headers, body: method === "POST" ? "{}" : undefined });
}

function jsonRequest(path: string, method: string, body: unknown, headers?: HeadersInit) {
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
