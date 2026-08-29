import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { routeApiRequest } from "../api/router";
import { derivePinHash, PIN_ITERATIONS, PIN_SESSION_MS, PinError, readPinRecord, setDevicePin, unlockDevice } from "./pin";

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
  for (const migration of ["0001_init.sql", "0002_fsrs.sql", "0003_sessions.sql", "0004_profile.sql", "0005_onyomi_script.sql", "0006_skipped.sql", "0007_pin.sql", "0008_unit_test_out.sql"]) sqlite.exec(readFileSync(`migrations/${migration}`, "utf8"));
  return { sqlite, env: { DB: d1(sqlite) } as Env };
}

function request(path: string, method = "GET", body?: unknown, cookie?: string) {
  const headers = new Headers();
  if (body !== undefined) headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  return new Request(`https://test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function cookie(response: Response): string {
  return response.headers.get("set-cookie")!.split(";", 1)[0];
}

describe("device PIN", () => {
  const databases: DatabaseSync[] = [];
  afterEach(() => { for (const database of databases.splice(0)) database.close(); });

  it("stores a Workers-compatible PBKDF2 hash and gates every non-unlock API route", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    expect(await (await routeApiRequest(request("/api/pin/state"), fixture.env)).json()).toEqual({ enabled: false, locked: false, lockedUntil: null });
    expect((await routeApiRequest(request("/api/health"), fixture.env)).status).toBe(200);

    const response = await routeApiRequest(request("/api/pin", "POST", { pin: "1234" }), fixture.env);
    expect(response.status).toBe(200);
    const stored = await readPinRecord(fixture.env.DB);
    expect(stored.pin_hash).not.toContain("1234");
    expect(stored.pin_iterations).toBe(PIN_ITERATIONS);
    expect(PIN_ITERATIONS).toBeLessThanOrEqual(100_000);
    expect(atob(stored.pin_salt!)).toHaveLength(16);
    expect(atob(stored.pin_secret!)).toHaveLength(32);

    for (const protectedRequest of [request("/api/stats"), request("/api/session/start", "POST", { mode: "lesson", tracks: ["kr"] })]) {
      const blocked = await routeApiRequest(protectedRequest, fixture.env);
      expect(blocked.status).toBe(401);
      expect(await blocked.json()).toMatchObject({ error: { code: "pin_required" } });
    }
    expect((await routeApiRequest(request("/api/pin", "POST", { pin: "5678", currentPin: "1234" }), fixture.env)).status).toBe(401);
  });

  it("uses a session-only sliding cookie and invalidates it on change or removal", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const start = 1_800_000_000_000;
    await routeApiRequest(request("/api/pin", "POST", { pin: "1234" }), fixture.env, start);
    const unlocked = await routeApiRequest(request("/api/pin/unlock", "POST", { pin: "1234" }), fixture.env, start);
    const originalCookie = cookie(unlocked);
    const setCookie = unlocked.headers.get("set-cookie")!;
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).not.toMatch(/Max-Age|Expires/iu);
    expect(originalCookie.split("=")[1].split(".")).toHaveLength(2);

    const active = await routeApiRequest(request("/api/health", "GET", undefined, originalCookie), fixture.env, start + PIN_SESSION_MS / 2);
    const refreshedCookie = cookie(active);
    expect(refreshedCookie).not.toBe(originalCookie);
    expect((await routeApiRequest(request("/api/health", "GET", undefined, originalCookie), fixture.env, start + PIN_SESSION_MS + 1)).status).toBe(401);
    expect((await routeApiRequest(request("/api/health", "GET", undefined, refreshedCookie), fixture.env, start + PIN_SESSION_MS + 1)).status).toBe(200);

    const before = (await readPinRecord(fixture.env.DB)).pin_secret;
    expect((await routeApiRequest(request("/api/pin", "POST", { pin: "5678", currentPin: "9999" }, refreshedCookie), fixture.env, start + PIN_SESSION_MS)).status).toBe(401);
    expect((await readPinRecord(fixture.env.DB)).pin_secret).toBe(before);
    expect((await routeApiRequest(request("/api/pin", "POST", { pin: "5678", currentPin: "1234" }, refreshedCookie), fixture.env, start + PIN_SESSION_MS)).status).toBe(200);
    expect((await readPinRecord(fixture.env.DB)).pin_secret).not.toBe(before);
    expect((await routeApiRequest(request("/api/health", "GET", undefined, refreshedCookie), fixture.env, start + PIN_SESSION_MS)).status).toBe(401);

    const changed = await routeApiRequest(request("/api/pin/unlock", "POST", { pin: "5678" }), fixture.env, start + PIN_SESSION_MS);
    const changedCookie = cookie(changed);
    const beforeFailedRemoval = await readPinRecord(fixture.env.DB);
    expect((await routeApiRequest(request("/api/pin", "DELETE", { currentPin: "9999" }, changedCookie), fixture.env)).status).toBe(401);
    expect(await readPinRecord(fixture.env.DB)).toEqual(beforeFailedRemoval);
    expect((await routeApiRequest(request("/api/pin", "DELETE", { currentPin: "5678" }, changedCookie), fixture.env)).status).toBe(200);
    expect(await readPinRecord(fixture.env.DB)).toMatchObject({ pin_hash: null, pin_salt: null, pin_iterations: null, pin_secret: null, pin_failures: 0, pin_locked_until: null });
    expect((await routeApiRequest(request("/api/health", "GET", undefined, changedCookie), fixture.env)).status).toBe(200);
    await routeApiRequest(request("/api/pin", "POST", { pin: "9012" }), fixture.env);
    expect((await routeApiRequest(request("/api/health", "GET", undefined, changedCookie), fixture.env)).status).toBe(401);
  });

  it("locks after five failures, doubles to the cap, skips KDF while locked, then resets", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    await setDevicePin(fixture.env.DB, "1234", undefined);
    let now = 2_000_000_000_000;
    let derives = 0;
    const wrong = async () => { derives += 1; return new Uint8Array(32); };

    for (let failure = 1; failure <= 4; failure += 1) {
      await expect(unlockDevice(fixture.env.DB, "9999", now, wrong)).rejects.toMatchObject({ status: 401 });
    }
    await expect(unlockDevice(fixture.env.DB, "9999", now, wrong)).rejects.toMatchObject({ status: 429, retryAfter: 60 });
    const beforeLockedAttempt = derives;
    await expect(unlockDevice(fixture.env.DB, "9999", now + 1, wrong)).rejects.toMatchObject({ status: 429, retryAfter: 60 });
    expect(derives).toBe(beforeLockedAttempt);

    for (const delay of [120, 240, 480, 900, 900]) {
      now = (await readPinRecord(fixture.env.DB)).pin_locked_until!;
      await expect(unlockDevice(fixture.env.DB, "9999", now, wrong)).rejects.toMatchObject({ status: 429, retryAfter: delay });
    }
    now = (await readPinRecord(fixture.env.DB)).pin_locked_until!;
    await unlockDevice(fixture.env.DB, "1234", now);
    expect(await readPinRecord(fixture.env.DB)).toMatchObject({ pin_failures: 0, pin_locked_until: null });
  });

  it("rejects a stale correct result after parallel failures lock the device", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    await setDevicePin(fixture.env.DB, "1234", undefined);
    const now = 2_100_000_000_000;
    let releaseCorrect!: () => void;
    let correctStarted!: () => void;
    const held = new Promise<void>((resolve) => { releaseCorrect = resolve; });
    const started = new Promise<void>((resolve) => { correctStarted = resolve; });
    const correctAttempt = unlockDevice(fixture.env.DB, "1234", now, async (pin, salt, iterations) => {
      correctStarted();
      await held;
      return derivePinHash(pin, salt, iterations);
    });
    await started;

    const wrong = async () => new Uint8Array(32);
    const failures = await Promise.allSettled(Array.from({ length: 5 }, () => unlockDevice(fixture.env.DB, "9999", now, wrong)));
    expect(failures.filter((result) => result.status === "rejected" && result.reason instanceof PinError && result.reason.status === 401)).toHaveLength(4);
    expect(failures.filter((result) => result.status === "rejected" && result.reason instanceof PinError && result.reason.status === 429)).toHaveLength(1);
    expect(await readPinRecord(fixture.env.DB)).toMatchObject({ pin_failures: 5, pin_locked_until: now + 60_000 });

    releaseCorrect();
    await expect(correctAttempt).rejects.toMatchObject({ status: 429, retryAfter: 60 });
    expect(await readPinRecord(fixture.env.DB)).toMatchObject({ pin_failures: 5, pin_locked_until: now + 60_000 });
  });
});
