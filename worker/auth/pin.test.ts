import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { routeApiRequest } from "../api/router";
import { applyMigrations } from "../test/schema";
import { derivePinHash, PIN_ITERATIONS, PIN_SESSION_MS, PinError, readPinRecord, removeDevicePin, setDevicePin, unlockDevice } from "./pin";

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

function request(path: string, method = "GET", body?: unknown, cookie?: string, expectedProfileId = 1) {
  const headers = new Headers();
  if (body !== undefined) headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  headers.set("x-hanja-profile-id", String(expectedProfileId));
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
    const recoveryCode = (await response.json() as { recoveryCode: string }).recoveryCode;
    expect(recoveryCode).toMatch(/^[A-HJ-NP-Z2-9]{10}$/u);
    const stored = await readPinRecord(fixture.env.DB, 1);
    expect(stored.pin_hash).not.toContain("1234");
    expect(stored.recovery_hash).not.toContain(recoveryCode);
    expect(stored.pin_iterations).toBe(PIN_ITERATIONS);
    expect(stored.recovery_iterations).toBe(PIN_ITERATIONS);
    expect(PIN_ITERATIONS).toBeLessThanOrEqual(100_000);
    expect(atob(stored.pin_salt!)).toHaveLength(16);
    expect(atob(stored.recovery_salt!)).toHaveLength(16);
    expect(atob(stored.pin_secret!)).toHaveLength(32);

    for (const protectedRequest of [request("/api/stats"), request("/api/session/start", "POST", { mode: "lesson", tracks: ["kr"] })]) {
      const blocked = await routeApiRequest(protectedRequest, fixture.env);
      expect(blocked.status).toBe(401);
      expect(await blocked.json()).toMatchObject({ error: { code: "profile_required" } });
    }
    expect((await routeApiRequest(request("/api/pin", "POST", { pin: "5678", currentPin: "1234" }), fixture.env)).status).toBe(401);
  });

  it("uses a session-only sliding cookie and invalidates it on change or removal", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const start = 1_800_000_000_000;
    await routeApiRequest(request("/api/pin", "POST", { pin: "1234" }), fixture.env, start);
    const unlocked = await routeApiRequest(request("/api/pin/unlock", "POST", { profileId: 1, pin: "1234" }), fixture.env, start);
    const originalCookie = cookie(unlocked);
    // Every cookie-bearing response also clears the legacy pre-multi-profile
    // cookie name (a second Set-Cookie header) -- inspect the session cookie's
    // own header, not the combined value, so this only asserts its attributes.
    const setCookie = unlocked.headers.getSetCookie().find((entry) => entry.startsWith("hanja_session="))!;
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).not.toMatch(/Max-Age|Expires/iu);
    expect(originalCookie.split("=")[1].split(".")).toHaveLength(3);

    const active = await routeApiRequest(request("/api/health", "GET", undefined, originalCookie), fixture.env, start + PIN_SESSION_MS / 2);
    const refreshedCookie = cookie(active);
    expect(refreshedCookie).not.toBe(originalCookie);
    expect((await routeApiRequest(request("/api/health", "GET", undefined, originalCookie), fixture.env, start + PIN_SESSION_MS + 1)).status).toBe(401);
    expect((await routeApiRequest(request("/api/health", "GET", undefined, refreshedCookie), fixture.env, start + PIN_SESSION_MS + 1)).status).toBe(200);

    const before = (await readPinRecord(fixture.env.DB, 1)).pin_secret;
    expect((await routeApiRequest(request("/api/pin", "POST", { pin: "5678", currentPin: "9999" }, refreshedCookie), fixture.env, start + PIN_SESSION_MS)).status).toBe(401);
    expect((await readPinRecord(fixture.env.DB, 1)).pin_secret).toBe(before);
    expect((await routeApiRequest(request("/api/pin", "POST", { pin: "5678", currentPin: "1234" }, refreshedCookie), fixture.env, start + PIN_SESSION_MS)).status).toBe(200);
    expect((await readPinRecord(fixture.env.DB, 1)).pin_secret).not.toBe(before);
    expect((await routeApiRequest(request("/api/health", "GET", undefined, refreshedCookie), fixture.env, start + PIN_SESSION_MS)).status).toBe(401);

    const changed = await routeApiRequest(request("/api/pin/unlock", "POST", { profileId: 1, pin: "5678" }), fixture.env, start + PIN_SESSION_MS);
    const changedCookie = cookie(changed);
    const beforeFailedRemoval = await readPinRecord(fixture.env.DB, 1);
    expect((await routeApiRequest(request("/api/pin", "DELETE", { currentPin: "9999" }, changedCookie), fixture.env)).status).toBe(401);
    expect(await readPinRecord(fixture.env.DB, 1)).toEqual(beforeFailedRemoval);
    expect((await routeApiRequest(request("/api/pin", "DELETE", { currentPin: "5678" }, changedCookie), fixture.env)).status).toBe(200);
    const removed = await readPinRecord(fixture.env.DB, 1);
    expect(removed).toMatchObject({ pin_hash: null, pin_salt: null, pin_iterations: null, pin_failures: 0, pin_locked_until: null });
    expect(removed.pin_secret).not.toBe(beforeFailedRemoval.pin_secret);
    expect((await routeApiRequest(request("/api/health", "GET", undefined, changedCookie), fixture.env)).status).toBe(200);
    await routeApiRequest(request("/api/pin", "POST", { pin: "9012" }), fixture.env);
    expect((await routeApiRequest(request("/api/health", "GET", undefined, changedCookie), fixture.env)).status).toBe(401);
  });

  it("ends authenticated and anonymous sessions idempotently", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    await routeApiRequest(request("/api/pin", "POST", { pin: "1234" }), fixture.env);
    const activeCookie = cookie(await routeApiRequest(request("/api/pin/unlock", "POST", { profileId: 1, pin: "1234" }), fixture.env));

    for (const currentCookie of [activeCookie, undefined]) {
      const ended = await routeApiRequest(request("/api/session/end", "POST", undefined, currentCookie), fixture.env);
      expect(ended.status).toBe(200);
      expect(await ended.json()).toEqual({ ended: true });
      expect(ended.headers.get("set-cookie")).toContain("hanja_session=; Max-Age=0");
    }
  });

  it("rejects a stale initial PIN set after a concurrent PIN set wins", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    let release!: () => void;
    let started!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const deriving = new Promise<void>((resolve) => { started = resolve; });
    const stale = setDevicePin(fixture.env.DB, 1, "5678", undefined, Date.now(), async (pin, salt, iterations) => {
      const hash = await derivePinHash(pin, salt, iterations);
      started();
      await held;
      return hash;
    });
    const rejected = expect(stale).rejects.toMatchObject({ status: 409, code: "pin_conflict" });
    await deriving;

    await setDevicePin(fixture.env.DB, 1, "9012", undefined);
    release();
    await rejected;
    await expect(unlockDevice(fixture.env.DB, 1, "9012", Date.now())).resolves.toMatchObject({ token: expect.stringMatching(/^1\.\d+\.[\w-]+$/u) });
  });

  it("rejects a stale PIN removal after a concurrent PIN change wins", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    await setDevicePin(fixture.env.DB, 1, "1234", undefined);
    let release!: () => void;
    let started!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const deriving = new Promise<void>((resolve) => { started = resolve; });
    const stale = removeDevicePin(fixture.env.DB, 1, "1234", Date.now(), async (pin, salt, iterations) => {
      const hash = await derivePinHash(pin, salt, iterations);
      started();
      await held;
      return hash;
    });
    const rejected = expect(stale).rejects.toMatchObject({ status: 409, code: "pin_conflict" });
    await deriving;

    await setDevicePin(fixture.env.DB, 1, "5678", "1234");
    release();
    await rejected;
    await expect(unlockDevice(fixture.env.DB, 1, "5678", Date.now())).resolves.toMatchObject({ token: expect.stringMatching(/^1\.\d+\.[\w-]+$/u) });
  });

  it("lists only public fields and requires a signed selection when profiles multiply", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const initial = await (await routeApiRequest(request("/api/profiles"), fixture.env)).json();
    expect(initial).toEqual({ profiles: [{ id: 1, name: "나", hasPin: false, isAdmin: true }] });
    expect((await routeApiRequest(request("/api/health"), fixture.env)).status).toBe(200);

    const profileId = Number(fixture.sqlite.prepare("INSERT INTO profile (name) VALUES ('둘')").run().lastInsertRowid);
    expect(await (await routeApiRequest(request("/api/profiles"), fixture.env)).json()).toEqual({ profiles: [
      { id: 1, name: "나", hasPin: false, isAdmin: true },
      { id: profileId, name: "둘", hasPin: false, isAdmin: false },
    ] });
    expect((await routeApiRequest(request("/api/health"), fixture.env)).status).toBe(401);

    const selected = await routeApiRequest(request("/api/profiles/select", "POST", { profileId }), fixture.env);
    expect(selected.status).toBe(200);
    const selectedCookie = cookie(selected);
    expect((await routeApiRequest(request("/api/health", "GET", undefined, selectedCookie, profileId), fixture.env)).status).toBe(200);
    await setDevicePin(fixture.env.DB, 1, "1234", undefined);
    const parts = selectedCookie.split("=")[1].split(".");
    expect((await routeApiRequest(request("/api/health", "GET", undefined, `hanja_session=1.${parts[1]}.${parts[2]}`), fixture.env)).status).toBe(401);
    expect((await routeApiRequest(request("/api/health", "GET", undefined, `hanja_pin=${parts[1]}.${parts[2]}`), fixture.env)).status).toBe(401);

    await setDevicePin(fixture.env.DB, profileId, "4321", undefined);
    const bypass = await routeApiRequest(request("/api/profiles/select", "POST", { profileId }), fixture.env);
    expect(bypass.status).toBe(401);
    expect(bypass.headers.get("set-cookie")).toBeNull();
  });

  it("isolates lockouts and refuses a PIN-less admin once profiles multiply", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const now = 2_200_000_000_000;
    const adminSelection = cookie(await routeApiRequest(request("/api/profiles/select", "POST", { profileId: 1 }), fixture.env, now));
    const profileId = Number(fixture.sqlite.prepare("INSERT INTO profile (name) VALUES ('둘')").run().lastInsertRowid);
    expect((await routeApiRequest(request("/api/health", "GET", undefined, adminSelection), fixture.env, now)).status).toBe(401);
    const unsafeSelection = await routeApiRequest(request("/api/profiles/select", "POST", { profileId: 1 }), fixture.env, now);
    expect(unsafeSelection.status).toBe(409);
    expect(await unsafeSelection.json()).toMatchObject({ error: { code: "admin_pin_required" } });

    await setDevicePin(fixture.env.DB, 1, "1234", undefined, now);
    await setDevicePin(fixture.env.DB, profileId, "4321", undefined, now);
    for (let failure = 0; failure < 5; failure += 1) {
      await expect(unlockDevice(fixture.env.DB, profileId, "9999", now)).rejects.toMatchObject({ status: failure === 4 ? 429 : 401 });
    }
    expect(await readPinRecord(fixture.env.DB, 1)).toMatchObject({ pin_failures: 0, pin_locked_until: null });
    expect(await readPinRecord(fixture.env.DB, profileId)).toMatchObject({ pin_failures: 5, pin_locked_until: now + 60_000 });

    const adminCookie = cookie(await routeApiRequest(request("/api/pin/unlock", "POST", { profileId: 1, pin: "1234" }), fixture.env, now));
    const removal = await routeApiRequest(request("/api/pin", "DELETE", { currentPin: "1234" }, adminCookie), fixture.env, now);
    expect(removal.status).toBe(409);
    expect(await removal.json()).toMatchObject({ error: { code: "admin_pin_required" } });
    expect((await readPinRecord(fixture.env.DB, 1)).pin_hash).not.toBeNull();
  });

  it("recovers the admin with multiple profiles and invalidates the stored code", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const now = 2_300_000_000_000;
    const setResponse = await routeApiRequest(request("/api/pin", "POST", { pin: "1234" }), fixture.env, now);
    const recoveryCode = (await setResponse.json() as { recoveryCode: string }).recoveryCode;
    const profileId = Number(fixture.sqlite.prepare("INSERT INTO profile (name) VALUES ('둘')").run().lastInsertRowid);

    const wrongPin = await routeApiRequest(request("/api/pin/unlock", "POST", { profileId: 1, pin: "9999" }), fixture.env, now);
    const wrongCode = await routeApiRequest(request("/api/pin/recover", "POST", { profileId: 1, code: "AAAAAAAAAA" }), fixture.env, now);
    expect(wrongCode.status).toBe(wrongPin.status);
    expect(await wrongCode.json()).toEqual(await wrongPin.json());
    expect(await readPinRecord(fixture.env.DB, 1)).toMatchObject({ pin_failures: 2, pin_locked_until: null });

    const before = await readPinRecord(fixture.env.DB, 1);
    const recovered = await routeApiRequest(request("/api/pin/recover", "POST", { profileId: 1, code: recoveryCode }), fixture.env, now);
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toEqual({ recovered: true });
    const recoveredCookie = cookie(recovered);
    const stored = await readPinRecord(fixture.env.DB, 1);
    expect(stored).toMatchObject({
      pin_hash: null,
      pin_salt: null,
      pin_iterations: null,
      recovery_hash: null,
      recovery_salt: null,
      recovery_iterations: null,
      pin_failures: 0,
      pin_locked_until: null,
    });
    expect(stored.pin_secret).not.toBe(before.pin_secret);
    expect((await routeApiRequest(request("/api/health", "GET", undefined, recoveredCookie), fixture.env, now)).status).toBe(200);
    expect((await routeApiRequest(request("/api/session/end", "POST", undefined, recoveredCookie), fixture.env, now)).status).toBe(200);
    const selected = await routeApiRequest(request("/api/profiles/select", "POST", { profileId: 1 }), fixture.env, now);
    expect(selected.status).toBe(200);
    const selectedCookie = cookie(selected);
    expect((await routeApiRequest(request("/api/health", "GET", undefined, selectedCookie), fixture.env, now)).status).toBe(200);
    expect((await routeApiRequest(request(`/api/profiles/${profileId}`, "DELETE", undefined, selectedCookie), fixture.env, now)).status).toBe(200);

    const reused = await routeApiRequest(request("/api/pin/recover", "POST", { profileId: 1, code: recoveryCode }), fixture.env, now);
    expect(reused.status).toBe(400);
    expect(await reused.json()).toMatchObject({ error: { code: "pin_not_set" } });
  });

  it("shares failures and lockout between PIN and recovery attempts", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const now = 2_400_000_000_000;
    const setResponse = await routeApiRequest(request("/api/pin", "POST", { pin: "1234" }), fixture.env, now);
    const recoveryCode = (await setResponse.json() as { recoveryCode: string }).recoveryCode;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const path = attempt % 2 ? "/api/pin/recover" : "/api/pin/unlock";
      const body = attempt % 2 ? { profileId: 1, code: "AAAAAAAAAA" } : { profileId: 1, pin: "9999" };
      expect((await routeApiRequest(request(path, "POST", body), fixture.env, now)).status).toBe(401);
    }
    const locked = await routeApiRequest(request("/api/pin/recover", "POST", { profileId: 1, code: "AAAAAAAAAA" }), fixture.env, now);
    expect(locked.status).toBe(429);
    expect(await locked.json()).toEqual({ error: { code: "pin_locked", message: "Try again in 60 seconds" }, retryAfter: 60 });
    expect(await readPinRecord(fixture.env.DB, 1)).toMatchObject({ pin_failures: 5, pin_locked_until: now + 60_000 });

    const blockedCorrect = await routeApiRequest(request("/api/pin/recover", "POST", { profileId: 1, code: recoveryCode }), fixture.env, now + 1);
    expect(blockedCorrect.status).toBe(429);
    expect((await routeApiRequest(request("/api/pin/recover", "POST", { profileId: 1, code: recoveryCode }), fixture.env, now + 60_000)).status).toBe(200);
  });

  it("backfills a recovery code on the next successful legacy admin unlock", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    await setDevicePin(fixture.env.DB, 1, "1234", undefined);
    fixture.sqlite.exec("UPDATE profile SET recovery_hash = NULL, recovery_salt = NULL, recovery_iterations = NULL WHERE id = 1");

    const unlocked = await routeApiRequest(request("/api/pin/unlock", "POST", { profileId: 1, pin: "1234" }), fixture.env);
    const body = await unlocked.json() as { unlocked: true; recoveryCode?: string };
    expect(body.recoveryCode).toMatch(/^[A-HJ-NP-Z2-9]{10}$/u);
    const stored = await readPinRecord(fixture.env.DB, 1);
    expect(stored.recovery_hash).not.toContain(body.recoveryCode!);
    expect(stored.recovery_iterations).toBe(PIN_ITERATIONS);

    const next = await routeApiRequest(request("/api/pin/unlock", "POST", { profileId: 1, pin: "1234" }), fixture.env);
    expect(await next.json()).toEqual({ unlocked: true });
  });

  it("locks after five failures, doubles to the cap, skips KDF while locked, then resets", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    await setDevicePin(fixture.env.DB, 1, "1234", undefined);
    let now = 2_000_000_000_000;
    let derives = 0;
    const wrong = async () => { derives += 1; return new Uint8Array(32); };

    for (let failure = 1; failure <= 4; failure += 1) {
      await expect(unlockDevice(fixture.env.DB, 1, "9999", now, wrong)).rejects.toMatchObject({ status: 401 });
    }
    await expect(unlockDevice(fixture.env.DB, 1, "9999", now, wrong)).rejects.toMatchObject({ status: 429, retryAfter: 60 });
    const beforeLockedAttempt = derives;
    await expect(unlockDevice(fixture.env.DB, 1, "9999", now + 1, wrong)).rejects.toMatchObject({ status: 429, retryAfter: 60 });
    expect(derives).toBe(beforeLockedAttempt);

    for (const delay of [120, 240, 480, 900, 900]) {
      now = (await readPinRecord(fixture.env.DB, 1)).pin_locked_until!;
      await expect(unlockDevice(fixture.env.DB, 1, "9999", now, wrong)).rejects.toMatchObject({ status: 429, retryAfter: delay });
    }
    now = (await readPinRecord(fixture.env.DB, 1)).pin_locked_until!;
    await unlockDevice(fixture.env.DB, 1, "1234", now);
    expect(await readPinRecord(fixture.env.DB, 1)).toMatchObject({ pin_failures: 0, pin_locked_until: null });
  });

  it("rejects a stale correct result after parallel failures lock the device", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    await setDevicePin(fixture.env.DB, 1, "1234", undefined);
    const now = 2_100_000_000_000;
    let releaseCorrect!: () => void;
    let correctStarted!: () => void;
    const held = new Promise<void>((resolve) => { releaseCorrect = resolve; });
    const started = new Promise<void>((resolve) => { correctStarted = resolve; });
    const correctAttempt = unlockDevice(fixture.env.DB, 1, "1234", now, async (pin, salt, iterations) => {
      correctStarted();
      await held;
      return derivePinHash(pin, salt, iterations);
    });
    await started;

    const wrong = async () => new Uint8Array(32);
    const failures = await Promise.allSettled(Array.from({ length: 5 }, () => unlockDevice(fixture.env.DB, 1, "9999", now, wrong)));
    expect(failures.filter((result) => result.status === "rejected" && result.reason instanceof PinError && result.reason.status === 401)).toHaveLength(4);
    expect(failures.filter((result) => result.status === "rejected" && result.reason instanceof PinError && result.reason.status === 429)).toHaveLength(1);
    expect(await readPinRecord(fixture.env.DB, 1)).toMatchObject({ pin_failures: 5, pin_locked_until: now + 60_000 });

    releaseCorrect();
    await expect(correctAttempt).rejects.toMatchObject({ status: 429, retryAfter: 60 });
    expect(await readPinRecord(fixture.env.DB, 1)).toMatchObject({ pin_failures: 5, pin_locked_until: now + 60_000 });
  });
});
