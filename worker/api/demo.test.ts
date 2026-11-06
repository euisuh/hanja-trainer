/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/require-safety-comment-for-type-assertion -- SQLite D1 test adapter and JSON response reads mirror the existing pin/router test adapters; assertions check every value read. */
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { routeApiRequest } from "./router";
import { DEMO_LIVE_CAP, DEMO_PER_CLIENT_PER_HOUR, DEMO_WRITE_QUOTA } from "./demo";
import { createSessionToken, GUEST_IDLE_MS, GUEST_MAX_AGE_MS, setDevicePin } from "../auth/pin";
import { applyMigrations } from "../test/schema";

function result<T>(results: T[], changes = 0): D1Result<T> {
  return { results, success: true, meta: { duration: 0, size_after: 0, rows_read: 0, rows_written: changes, last_row_id: 0, changed_db: changes > 0, changes } };
}

function d1(sqlite: DatabaseSync): D1Database {
  const adapter = Object.create(null) as D1Database;
  adapter.prepare = (query: string) => {
    let values: SQLInputValue[] = [];
    const statement = Object.create(null) as D1PreparedStatement;
    statement.bind = (...bound: unknown[]) => {
      values = bound as SQLInputValue[];
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

// Real clock: patchSettings stamps updated_at with the wall clock, which feeds guest idle expiry.
const NOW = Date.now();
const databases: DatabaseSync[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  databases.push(sqlite);
  applyMigrations(sqlite);
  sqlite.exec("PRAGMA foreign_keys = ON");
  return { sqlite, env: { DB: d1(sqlite) } as Env };
}

function request(path: string, init: { method?: string; body?: unknown; cookie?: string; profileId?: number; ip?: string; bearer?: boolean } = {}) {
  const headers = new Headers();
  if (init.body !== undefined) headers.set("content-type", "application/json");
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.profileId !== undefined) headers.set("x-hanja-profile-id", String(init.profileId));
  if (init.ip) headers.set("cf-connecting-ip", init.ip);
  if (init.bearer) headers.set("x-hanja-session-transport", "bearer");
  return new Request(`https://test${path}`, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
}

function cookies(response: Response): string {
  return response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).filter((value) => !value.endsWith("=")).join("; ");
}

async function startDemo(env: Env, now = NOW, ip = "203.0.113.1") {
  const response = await routeApiRequest(request("/api/demo/session", { method: "POST", body: {}, ip }), env, now);
  expect(response.status).toBe(200);
  const cookie = cookies(response);
  return { cookie, id: Number(/hanja_session=(\d+)\./u.exec(cookie)![1]) };
}

async function names(env: Env, cookie?: string, now = NOW) {
  const body = await (await routeApiRequest(request("/api/profiles", { cookie }), env, now)).json() as { profiles: Array<{ name: string }> };
  return body.profiles.map((profile) => profile.name);
}

describe("demo sandbox", () => {
  it("issues an onboarded Japanese-only sandbox that leaves the lone owner profile alone", async () => {
    const { sqlite, env } = setup();
    const demo = await startDemo(env);
    expect(demo.id).not.toBe(1);
    const profile = await (await routeApiRequest(request("/api/profile", { cookie: demo.cookie }), env, NOW)).json() as { id: number };
    expect(profile.id).toBe(demo.id);
    const settings = await (await routeApiRequest(request("/api/settings", { cookie: demo.cookie }), env, NOW)).json() as { enabledTracks: string[] };
    expect(settings.enabledTracks).toEqual(["jp"]);
    expect((await (await routeApiRequest(request("/api/onboarding-state", { cookie: demo.cookie }), env, NOW)).json() as { onboarded: boolean }).onboarded).toBe(true);
    // The owner's lone PIN-less profile still auto-selects and is still the only one listed.
    const anonymous = await (await routeApiRequest(request("/api/profile"), env, NOW)).json() as { id: number };
    expect(anonymous.id).toBe(1);
    expect(await names(env)).toEqual(["나"]);
    expect(sqlite.prepare("SELECT is_demo, is_admin, pin_hash FROM profile WHERE id = ?").get(demo.id)).toEqual({ is_demo: 1, is_admin: 0, pin_hash: null });
  });

  it("returns the token in the body for bearer clients", async () => {
    const { env } = setup();
    const response = await routeApiRequest(request("/api/demo/session", { method: "POST", body: {}, bearer: true }), env, NOW);
    const body = await response.json() as { sessionToken: string };
    expect(body.sessionToken).toMatch(/^\d+\.\d+\.[\w-]+$/u);
    expect(response.headers.get("set-cookie")).toBeNull();
    const authed = await routeApiRequest(new Request("https://test/api/health", { headers: { authorization: `Bearer ${body.sessionToken}` } }), env, NOW);
    expect(authed.status).toBe(200);
  });

  it("slides the 7-day expiry with activity, then rejects and purges an idle guest with its data", async () => {
    const { sqlite, env } = setup();
    const guest = await startDemo(env);
    sqlite.prepare("INSERT INTO sessions (profile_id, mode, started_at, ended_at, answered, correct, best_combo, xp) VALUES (?, 'lesson', 0, 0, 0, 0, 0, 0)").run(guest.id);
    const day = 24 * 3_600_000;
    const health = (cookie: string, now: number) => routeApiRequest(request("/api/health", { cookie }), env, now);
    // Activity on day 6 renews the cookie for another 7 days and moves the idle clock.
    const day6 = await health(guest.cookie, NOW + 6 * day);
    expect(day6.status).toBe(200);
    expect(day6.headers.getSetCookie()[0]).toMatch(/^hanja_session=\d+\.\d+\.[\w-]+; Max-Age=604800; HttpOnly/u);
    const renewed = cookies(day6);
    expect((await health(renewed, NOW + 12 * day)).status).toBe(200);
    // Seven idle days after the last activity it is gone, even with an unexpired token.
    const { pin_secret: secret } = sqlite.prepare("SELECT pin_secret FROM profile WHERE id = ?").get(guest.id) as { pin_secret: string };
    const late = await createSessionToken(guest.id, secret, NOW + 18 * day, GUEST_IDLE_MS);
    const bearer = (now: number) => routeApiRequest(new Request("https://test/api/health", { headers: { authorization: `Bearer ${late}` } }), env, now);
    expect((await bearer(NOW + 12 * day + GUEST_IDLE_MS)).status).toBe(401);
    await startDemo(env, NOW + 12 * day + GUEST_IDLE_MS, "198.51.100.9");
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM profile WHERE id = ?").get(guest.id)).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM sessions WHERE profile_id = ?").get(guest.id)).toEqual({ count: 0 });
  });

  it("resumes the same guest on the same browser, and starts a new one once it expired", async () => {
    const { sqlite, env } = setup();
    const guest = await startDemo(env);
    sqlite.prepare("UPDATE profile SET xp = 42 WHERE id = ?").run(guest.id);
    const again = await routeApiRequest(request("/api/demo/session", { method: "POST", body: {}, cookie: guest.cookie }), env, NOW + 3_600_000);
    expect(again.status).toBe(200);
    expect(again.headers.getSetCookie()[0]).toContain("; Max-Age=604800;");
    const resumed = Number(/hanja_session=(\d+)\./u.exec(cookies(again))![1]);
    expect(resumed).toBe(guest.id);
    expect(sqlite.prepare("SELECT xp FROM profile WHERE id = ?").get(resumed)).toEqual({ xp: 42 });
    // Resuming does not spend the per-client create budget.
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM profile WHERE is_demo = 1").get()).toEqual({ count: 1 });
    const expired = await routeApiRequest(request("/api/demo/session", { method: "POST", body: {}, cookie: guest.cookie }), env, NOW + GUEST_IDLE_MS + 3_600_000);
    expect(expired.status).toBe(200);
    expect(Number(/hanja_session=(\d+)\./u.exec(cookies(expired))![1])).not.toBe(guest.id);
  });

  it("ignores client-influenced timestamps: a far-future endedAt or updated_at cannot extend a guest", async () => {
    const { sqlite, env } = setup();
    const guest = await startDemo(env);
    const posted = await routeApiRequest(request("/api/sessions", {
      method: "POST", cookie: guest.cookie, profileId: guest.id,
      body: { sessionId: "far-future", mode: "lesson", startedAt: "2099-01-01T00:00:00.000Z", endedAt: "2099-01-01T00:10:00.000Z", answered: 1, correct: 1, skipped: 0, bestCombo: 1, xp: 10 },
    }), env, NOW);
    expect(posted.status).toBe(200);
    sqlite.prepare("UPDATE profile SET updated_at = ? WHERE id = ?").run(Date.parse("2099-01-01"), guest.id);
    const idle = NOW + GUEST_IDLE_MS + 1;
    expect((await routeApiRequest(request("/api/health", { cookie: guest.cookie }), env, idle)).status).not.toBe(200);
    await startDemo(env, idle, "198.51.100.7");
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM profile WHERE id = ?").get(guest.id)).toEqual({ count: 0 });
  });

  it("caps a guest at 30 days from creation however active it stays", async () => {
    const { sqlite, env } = setup();
    const guest = await startDemo(env);
    const day = 24 * 3_600_000;
    let cookie = guest.cookie;
    for (const at of [6, 12, 18, 24, 29]) {
      const response = await routeApiRequest(request("/api/health", { cookie }), env, NOW + at * day);
      expect(response.status).toBe(200);
      cookie = cookies(response);
      // Cookie life never runs past creation + 30 days.
      const maxAge = Number(/Max-Age=(\d+)/u.exec(response.headers.getSetCookie()[0])![1]) * 1_000;
      expect(at * day + maxAge).toBeLessThanOrEqual(GUEST_MAX_AGE_MS);
    }
    const profile = await routeApiRequest(request("/api/profile", { cookie }), env, NOW + GUEST_MAX_AGE_MS);
    expect(profile.status).toBe(401);
    // Resume refuses it too and hands out a fresh guest.
    const resumed = await routeApiRequest(request("/api/demo/session", { method: "POST", body: {}, cookie }), env, NOW + GUEST_MAX_AGE_MS);
    expect(Number(/hanja_session=(\d+)\./u.exec(cookies(resumed))![1])).not.toBe(guest.id);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM profile WHERE id = ?").get(guest.id)).toEqual({ count: 0 });
  });

  it("records every activity precisely: the profile lives as long as the cookie it just renewed", async () => {
    const { env } = setup();
    const guest = await startDemo(env);
    const lastActivity = NOW + 3_600_000 - 1_000; // 59m59s, inside any hourly throttle window
    const touched = await routeApiRequest(request("/api/health", { cookie: guest.cookie }), env, lastActivity);
    const renewed = cookies(touched);
    expect(touched.headers.getSetCookie()[0]).toContain("; Max-Age=604800;");
    expect((await routeApiRequest(request("/api/profile", { cookie: renewed }), env, lastActivity + GUEST_IDLE_MS - 1_000)).status).toBe(200);
  });

  it("does not resume a guest purged between resolve and touch", async () => {
    const { sqlite, env } = setup();
    const guest = await startDemo(env);
    // Delete the row the moment the touch runs, as a concurrent purge would.
    const racing = { ...env, DB: { ...env.DB, prepare: (query: string) => {
      if (query.includes("SET demo_active_at")) sqlite.prepare("DELETE FROM profile WHERE id = ?").run(guest.id);
      return env.DB.prepare(query);
    }, batch: env.DB.batch } as D1Database } as Env;
    const resumed = await routeApiRequest(request("/api/demo/session", { method: "POST", body: {}, cookie: guest.cookie }), racing, NOW + 60_000);
    expect(resumed.status).toBe(200);
    const fresh = cookies(resumed);
    expect(Number(/hanja_session=(\d+)\./u.exec(fresh)![1])).not.toBe(guest.id);
    expect((await routeApiRequest(request("/api/health", { cookie: fresh }), env, NOW + 60_000)).status).toBe(200);
  });

  it("rejects a request whose guest is purged between resolve and touch", async () => {
    const { sqlite, env } = setup();
    const guest = await startDemo(env);
    const racing = { ...env, DB: { ...env.DB, prepare: (query: string) => {
      if (query.includes("SET demo_active_at")) sqlite.prepare("DELETE FROM profile WHERE id = ?").run(guest.id);
      return env.DB.prepare(query);
    }, batch: env.DB.batch } as D1Database } as Env;
    const response = await routeApiRequest(request("/api/health", { cookie: guest.cookie }), racing, NOW + 60_000);
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toContain("hanja_session=; Max-Age=0; HttpOnly; Secure; SameSite=Strict; Path=/");
  });

  it("labels the guest profile and reports it on /api/profile", async () => {
    const { env } = setup();
    const guest = await startDemo(env);
    const profile = await (await routeApiRequest(request("/api/profile", { cookie: guest.cookie }), env, NOW)).json() as { name: string; isGuest?: boolean };
    expect(profile).toMatchObject({ name: "게스트", isGuest: true });
    const owner = await (await routeApiRequest(request("/api/profile"), env, NOW)).json() as { isGuest?: boolean };
    expect(owner.isGuest).toBe(false);
  });

  it("never lets an expired or purged demo cookie fall through to the lone PIN-less owner", async () => {
    const { sqlite, env } = setup();
    const demo = await startDemo(env);
    const as = (path: string, now: number, method = "GET", body?: unknown) => routeApiRequest(request(path, { method, body, cookie: demo.cookie, profileId: 1 }), env, now);
    for (const now of [NOW + GUEST_IDLE_MS, NOW + GUEST_IDLE_MS + 24 * 3_600_000]) {
      const profile = await as("/api/profile", now);
      expect(profile.status).toBe(401);
      expect(profile.headers.getSetCookie()).toContain("hanja_session=; Max-Age=0; HttpOnly; Secure; SameSite=Strict; Path=/");
      expect((await as("/api/pin", now, "POST", { pin: "1234" })).status).toBe(401);
    }
    sqlite.prepare("DELETE FROM profile WHERE id = ?").run(demo.id);
    expect((await as("/api/pin", NOW, "POST", { pin: "1234" })).status).toBe(401);
    expect(sqlite.prepare("SELECT pin_hash FROM profile WHERE id = 1").get()).toEqual({ pin_hash: null });
  });

  it("rate-limits per client per hour", async () => {
    const { env } = setup();
    for (let index = 0; index < DEMO_PER_CLIENT_PER_HOUR; index += 1) await startDemo(env);
    const limited = await routeApiRequest(request("/api/demo/session", { method: "POST", body: {}, ip: "203.0.113.1" }), env, NOW);
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error: { code: "demo_rate_limited" } });
    expect(limited.headers.get("set-cookie")).toBeNull();
    await startDemo(env, NOW, "203.0.113.2");
    await startDemo(env, NOW + 3_600_001);
  });

  it("caps live demo profiles", async () => {
    const { sqlite, env } = setup();
    const insert = sqlite.prepare("INSERT INTO profile (name, is_demo, demo_client, created_at, updated_at, demo_active_at) VALUES ('게스트', 1, ?, ?, ?, ?)");
    for (let index = 0; index < DEMO_LIVE_CAP; index += 1) insert.run(`client-${index}`, NOW, NOW, NOW);
    const full = await routeApiRequest(request("/api/demo/session", { method: "POST", body: {} }), env, NOW);
    expect(full.status).toBe(503);
    expect(await full.json()).toMatchObject({ error: { code: "demo_capacity" } });
    // Demo rows never consume the five real-profile slots.
    expect(() => sqlite.prepare("INSERT INTO profile (name) VALUES ('둘')").run()).not.toThrow();
  });

  it("cannot change a PIN, manage profiles, or be selected by id", async () => {
    const { env } = setup();
    const demo = await startDemo(env);
    const other = await startDemo(env);
    const as = (path: string, method: string, body?: unknown) => routeApiRequest(request(path, { method, body, cookie: demo.cookie, profileId: demo.id }), env, NOW);
    for (const response of [
      await as("/api/pin", "POST", { pin: "1234" }),
      await as("/api/pin", "DELETE", { currentPin: "1234" }),
      await as("/api/profiles", "POST", { name: "셋" }),
      await as(`/api/profiles/${other.id}`, "DELETE"),
      await as(`/api/profiles/${demo.id}`, "PATCH", { name: "x" }),
    ]) {
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "demo_forbidden" } });
    }
    const hijack = await routeApiRequest(request("/api/profiles/select", { method: "POST", body: { profileId: other.id } }), env, NOW);
    expect(hijack.status).toBe(404);
    expect(hijack.headers.get("set-cookie")).toBeNull();
  });

  it("stops writes once the quota is used up but keeps reads working", async () => {
    const { sqlite, env } = setup();
    const demo = await startDemo(env);
    const patch = () => routeApiRequest(request("/api/settings", { method: "PATCH", body: { dailyGoal: 20 }, cookie: demo.cookie, profileId: demo.id }), env, NOW);
    expect((await patch()).status).toBe(200);
    sqlite.prepare("UPDATE profile SET demo_writes = ? WHERE id = ?").run(DEMO_WRITE_QUOTA, demo.id);
    const blocked = await patch();
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ error: { code: "demo_quota" } });
    expect((await routeApiRequest(request("/api/settings", { cookie: demo.cookie }), env, NOW)).status).toBe(200);
  });
});

describe("profile listing", () => {
  it("hides real names from anonymous and demo callers, shows them to sessions and unlocked devices", async () => {
    const { sqlite, env } = setup();
    await setDevicePin(env.DB, 1, "1234", undefined, NOW);
    sqlite.prepare("INSERT INTO profile (name) VALUES ('준')").run();

    expect(await names(env)).toEqual(["관리자"]);
    const demo = await startDemo(env);
    expect(await names(env, demo.cookie)).toEqual(["관리자"]);

    const unlocked = await routeApiRequest(request("/api/pin/unlock", { method: "POST", body: { profileId: 1, pin: "1234" } }), env, NOW);
    expect(unlocked.status).toBe(200);
    const all = cookies(unlocked);
    expect(await names(env, all)).toEqual(["나", "준"]);

    // The device cookie alone keeps the list after the session ends or expires…
    const device = all.split("; ").find((value) => value.startsWith("hanja_device="))!;
    expect(await names(env, device, NOW + 30 * 24 * 3_600_000)).toEqual(["나", "준"]);
    expect((await routeApiRequest(request("/api/health", { cookie: device }), env, NOW)).status).toBe(401);
    // …is not a session token in disguise, and dies when the PIN (and secret) rotates.
    expect((await routeApiRequest(request("/api/health", { cookie: `hanja_session=${device.split("=")[1]}` }), env, NOW)).status).toBe(401);
    await setDevicePin(env.DB, 1, "5678", "1234", NOW);
    expect(await names(env, device)).toEqual(["관리자"]);
  });

  it("lets only trusted callers select a hidden PIN-less profile", async () => {
    const { sqlite, env } = setup();
    await setDevicePin(env.DB, 1, "1234", undefined, NOW);
    const childId = Number(sqlite.prepare("INSERT INTO profile (name) VALUES ('준')").run().lastInsertRowid);
    const select = (cookie?: string, native = false) => routeApiRequest(new Request("https://test/api/profiles/select", {
      method: "POST",
      headers: [["content-type", "application/json"], ...cookie === undefined ? [] : [["cookie", cookie]], ...native ? [["origin", "capacitor://localhost"]] : []] as Array<[string, string]>,
      body: JSON.stringify({ profileId: childId }),
    }), env, NOW);
    const demo = await startDemo(env);
    for (const response of [await select(), await select(demo.cookie), await select(undefined, true)]) {
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "device_not_trusted" } });
    }
    const unlocked = cookies(await routeApiRequest(request("/api/pin/unlock", { method: "POST", body: { profileId: 1, pin: "1234" } }), env, NOW));
    const device = unlocked.split("; ").find((value) => value.startsWith("hanja_device="))!;
    const session = unlocked.split("; ").find((value) => value.startsWith("hanja_session="))!;
    expect((await select(device)).status).toBe(200);
    expect((await select(session)).status).toBe(200);
  });

  it("does not issue a device cookie to bearer clients or on PIN-less selection", async () => {
    const { sqlite, env } = setup();
    await setDevicePin(env.DB, 1, "1234", undefined, NOW);
    const childId = Number(sqlite.prepare("INSERT INTO profile (name) VALUES ('준')").run().lastInsertRowid);
    const selected = await routeApiRequest(request("/api/profiles/select", { method: "POST", body: { profileId: childId } }), env, NOW);
    expect(selected.headers.getSetCookie().some((value) => value.startsWith("hanja_device="))).toBe(false);
    const bearer = await routeApiRequest(request("/api/pin/unlock", { method: "POST", body: { profileId: 1, pin: "1234" }, bearer: true }), env, NOW);
    expect(bearer.headers.get("set-cookie")).toBeNull();
  });
});
