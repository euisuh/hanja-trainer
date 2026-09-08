import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { derivePinHash, PIN_ITERATIONS, removeDevicePin } from "../auth/pin";
import { applyMigrations } from "../test/schema";
import { createProfile } from "./profiles";
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

function request(path: string, method = "GET", body?: unknown, session?: string, expectedProfileId = 1) {
  const headers = new Headers();
  if (body !== undefined) headers.set("content-type", "application/json");
  if (session) headers.set("cookie", session);
  headers.set("x-hanja-profile-id", String(expectedProfileId));
  return new Request(`https://test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function cookie(response: Response): string {
  return response.headers.get("set-cookie")!.split(";", 1)[0];
}

async function adminSession(env: Env, now = 2_000_000_000_000): Promise<string> {
  expect((await routeApiRequest(request("/api/pin", "POST", { pin: "1234" }), env, now)).status).toBe(200);
  const unlocked = await routeApiRequest(request("/api/pin/unlock", "POST", { profileId: 1, pin: "1234" }), env, now);
  expect(unlocked.status).toBe(200);
  return cookie(unlocked);
}

async function postProfile(env: Env, session: string, body: unknown, now = 2_000_000_000_001): Promise<Response> {
  return routeApiRequest(request("/api/profiles", "POST", body, session), env, now);
}

describe("profile management API", () => {
  const databases: DatabaseSync[] = [];
  afterEach(() => { for (const database of databases.splice(0)) database.close(); });

  it("requires an admin PIN and validates names and privilege fields", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const withoutPin = await postProfile(fixture.env, "", { name: "둘" });
    expect(withoutPin.status).toBe(409);
    expect(await withoutPin.json()).toMatchObject({ error: { code: "admin_pin_required" } });
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM profile").get()).toEqual({ count: 1 });

    const session = await adminSession(fixture.env);
    for (const body of [
      { name: "둘", is_admin: 1 },
      { name: "둘", isAdmin: true },
      { name: "   " },
      { name: "😀".repeat(25) },
      { name: "둘", pin: "12a4" },
    ]) expect((await postProfile(fixture.env, session, body)).status).toBe(400);
    expect((await routeApiRequest(request("/api/profiles/1", "PATCH", { name: "나", is_admin: 0 }, session), fixture.env)).status).toBe(400);
  });

  it("creates trimmed duplicate names with optional shared-path PIN credentials and no secret response fields", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const session = await adminSession(fixture.env);
    const name = "😀".repeat(24);
    const response = await postProfile(fixture.env, session, { name: `  ${name}  `, pin: "4321" });
    expect(response.status).toBe(201);
    const created = await response.json() as { id: number; name: string; isAdmin: boolean };
    expect(created).toEqual({ id: expect.any(Number), name, isAdmin: false });
    expect(Object.keys(created).sort()).toEqual(["id", "isAdmin", "name"]);

    const stored = fixture.sqlite.prepare("SELECT onboarded_at, pin_hash, pin_salt, pin_iterations, pin_secret FROM profile WHERE id = ?").get(created.id) as Record<string, string | number | null>;
    expect(stored.onboarded_at).toBeNull();
    expect(stored.pin_iterations).toBe(PIN_ITERATIONS);
    expect(atob(stored.pin_salt as string)).toHaveLength(16);
    expect(atob(stored.pin_secret as string)).toHaveLength(32);
    expect(stored.pin_hash).not.toContain("4321");

    const unlocked = await routeApiRequest(request("/api/pin/unlock", "POST", { profileId: created.id, pin: "4321" }), fixture.env);
    expect(unlocked.status).toBe(200);
    const unlockedBody = await unlocked.json();
    expect(unlockedBody).toEqual({ unlocked: true });
    const duplicate = await postProfile(fixture.env, session, { name });
    expect(duplicate.status).toBe(201);

    const publicBody = await (await routeApiRequest(request("/api/profiles"), fixture.env)).json();
    expect(JSON.stringify([created, publicBody, unlockedBody])).not.toMatch(/pin_(?:hash|salt|secret)|pinHash|pinSalt|pinSecret/u);
  });

  it("returns 403 for every non-admin mutation, including self-rename and self-delete", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const session = await adminSession(fixture.env);
    const created = await (await postProfile(fixture.env, session, { name: "학습자", pin: "4321" })).json() as { id: number };
    const childSession = cookie(await routeApiRequest(request("/api/pin/unlock", "POST", { profileId: created.id, pin: "4321" }), fixture.env));

    const attempts = [
      request("/api/profiles", "POST", { name: "셋", is_admin: 1 }, childSession, created.id),
      request(`/api/profiles/${created.id}`, "PATCH", { name: "내 이름", is_admin: 1 }, childSession, created.id),
      request(`/api/profiles/${created.id}`, "DELETE", undefined, childSession, created.id),
    ];
    for (const attempt of attempts) {
      const response = await routeApiRequest(attempt, fixture.env);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "admin_required" } });
    }
    expect(await (await routeApiRequest(request("/api/settings", "GET", undefined, childSession, created.id), fixture.env)).json()).toMatchObject({ isAdmin: false });
    const selfDelete = await routeApiRequest(request("/api/profiles/1", "DELETE", undefined, session), fixture.env);
    expect(selfDelete.status).toBe(409);
    expect(await selfDelete.json()).toMatchObject({ error: { code: "profile_self_delete" } });
    expect(fixture.sqlite.prepare("SELECT is_admin FROM profile WHERE id = 1").get()).toEqual({ is_admin: 1 });
  });

  it("maps the storage cap under a create race and leaves exactly five profiles", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const session = await adminSession(fixture.env);
    for (const name of ["둘", "셋", "넷"]) expect((await postProfile(fixture.env, session, { name })).status).toBe(201);
    const raced = await Promise.all([
      postProfile(fixture.env, session, { name: "다섯-a" }),
      postProfile(fixture.env, session, { name: "다섯-b" }),
    ]);
    expect(raced.map((response) => response.status).sort()).toEqual([201, 409]);
    const failed = raced.find((response) => response.status === 409)!;
    expect(await failed.json()).toMatchObject({ error: { code: "profile_limit" } });
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM profile").get()).toEqual({ count: 5 });
    const sixth = await postProfile(fixture.env, session, { name: "여섯" });
    expect(sixth.status).toBe(409);
    expect(await sixth.json()).toMatchObject({ error: { code: "profile_limit" } });
  });

  it("atomically rejects creation when the admin PIN is removed during PIN derivation", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    await adminSession(fixture.env);
    let release!: () => void;
    let deriving!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { deriving = resolve; });
    const creation = createProfile(fixture.env.DB, 1, { name: "아이", pin: "4321" }, Date.now(), async (pin, salt, iterations) => {
      const hash = await derivePinHash(pin, salt, iterations);
      deriving();
      await held;
      return hash;
    });
    const rejected = expect(creation).rejects.toMatchObject({ status: 409, code: "admin_pin_required" });
    await started;
    await removeDevicePin(fixture.env.DB, 1, "1234");
    release();
    await rejected;
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM profile").get()).toEqual({ count: 1 });
  });

  it("renames profiles and cascades deletion through all seven progress tables only for the target", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const session = await adminSession(fixture.env);
    const child = await (await postProfile(fixture.env, session, { name: "아이" })).json() as { id: number };
    const renamed = await routeApiRequest(request(`/api/profiles/${child.id}`, "PATCH", { name: "  가족  " }, session), fixture.env);
    expect(await renamed.json()).toEqual({ id: child.id, name: "가족", isAdmin: false });

    fixture.sqlite.exec(`
      INSERT INTO characters (key, meaning_en, meaning_ko, variants) VALUES ('字', 'character', '글자', '{}');
      INSERT INTO character_tracks (character_id, track, glyph, kr_reading, kr_level, level_ord) VALUES (1, 'kr', '字', '자', '8급', 1);
      INSERT INTO curriculum_units (track, level, ord, title, subtitle) VALUES ('kr', '8급', 1, '첫 유닛', '테스트');
      INSERT INTO curriculum_unit_members (unit_id, character_id, ord) VALUES (1, 1, 1);
    `);
    for (const profileId of [1, child.id]) {
      fixture.sqlite.prepare("INSERT INTO review_states (profile_id, character_id, track, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, due, correct_count, total_count) VALUES (?, 1, 'kr', 1, 5, 0, 1, 0, 1, 0, 2, NULL, 1, 1, 1)").run(profileId);
      fixture.sqlite.prepare("INSERT INTO review_log (profile_id, character_id, track, rating, answered_at, correct, elapsed_ms, scheduled_days_before, scheduled_days_after, mode, session_id, card_index, skipped) VALUES (?, 1, 'kr', 3, 1, 1, 10, 0, 1, 'lesson', 'cascade', 0, 0)").run(profileId);
      fixture.sqlite.prepare("INSERT INTO review_submissions (profile_id, session_id, card_index, response_json) VALUES (?, 'cascade', 0, '{}')").run(profileId);
      fixture.sqlite.prepare("INSERT INTO sessions (profile_id, mode, started_at, ended_at, answered, correct, best_combo, xp, skipped) VALUES (?, 'lesson', 1, 2, 1, 1, 1, 5, 0)").run(profileId);
      fixture.sqlite.prepare("INSERT INTO placement_results (profile_id, track, level_ord, level_badge, accuracy, detail, taken_at) VALUES (?, 'kr', 1, '8급', 100, 'test', 1)").run(profileId);
      fixture.sqlite.prepare("INSERT INTO curriculum_unit_completion_members (profile_id, unit_id, character_id, completed_at) VALUES (?, 1, 1, 1)").run(profileId);
      fixture.sqlite.prepare("INSERT INTO curriculum_unit_test_attempts (profile_id, session_id, unit_id, expected_answers, created_at, expires_at) VALUES (?, 'cascade', 1, '[]', 1, 2)").run(profileId);
    }

    const deleted = await routeApiRequest(request(`/api/profiles/${child.id}`, "DELETE", undefined, session), fixture.env);
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ deleted: true });
    for (const table of ["review_states", "review_log", "review_submissions", "sessions", "placement_results", "curriculum_unit_completion_members", "curriculum_unit_test_attempts"]) {
      expect(fixture.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE profile_id = ?`).get(child.id), table).toEqual({ count: 0 });
      expect(fixture.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE profile_id = 1`).get(), table).toEqual({ count: 1 });
    }
  });
});
