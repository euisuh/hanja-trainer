import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../test/schema";
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
