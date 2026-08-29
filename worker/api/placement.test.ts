import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { emitSeedSql, parseSeed } from "../../scripts/seed";
import type { CurriculumResponse, PlacementScoreResponse, StatsResponse } from "../../src/shared/api";
import { getProfile } from "./sessions";
import { getStats } from "./stats";
import { routeApiRequest } from "./router";

function result<T>(results: T[]): D1Result<T> {
  return { results, success: true, meta: { duration: 0, size_after: 0, rows_read: 0, rows_written: 0, last_row_id: 0, changed_db: false, changes: 0 } };
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
    statement.run = async <T>() => { sqlite.prepare(query).run(...values); return result<T>([]); };
    return statement;
  };
  adapter.batch = async <T>(statements: D1PreparedStatement[]) => Promise.all(statements.map((statement) => statement.all<T>()));
  return adapter;
}

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of ["0001_init.sql", "0002_fsrs.sql", "0003_sessions.sql", "0004_profile.sql", "0005_onyomi_script.sql", "0006_skipped.sql", "0007_pin.sql"]) sqlite.exec(readFileSync(`migrations/${migration}`, "utf8"));
  for (const path of ["data/characters/kr-8geup.json", "data/characters/jp-kanken-10.json", "data/characters/cn-hsk1.json"]) sqlite.exec(emitSeedSql(parseSeed(JSON.parse(readFileSync(path, "utf8")) as unknown)));
  return { sqlite, env: { DB: d1(sqlite) } as Env };
}

function request(path: string, method = "GET", body?: unknown) {
  return new Request(`https://test${path}`, { method, headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}

describe("profile, placement, and stats API", () => {
  const databases: DatabaseSync[] = [];
  afterEach(() => { for (const database of databases.splice(0)) database.close(); });

  it("enforces one profile row and persists validated settings without deleting review state", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    expect(() => fixture.sqlite.prepare("INSERT INTO profile (id) VALUES (2)").run()).toThrow();
    expect(await (await routeApiRequest(request("/api/settings"), fixture.env)).json()).toMatchObject({ onyomiScript: "katakana" });
    const character = fixture.sqlite.prepare("SELECT id FROM characters WHERE key = '金'").get() as { id: number };
    fixture.sqlite.prepare("INSERT INTO review_states VALUES (?, 'kr', 8, 5, 1, 2, 0, 2, 0, 2, 0, 0, 1, 1)").run(character.id);
    const patched = await routeApiRequest(request("/api/settings", "PATCH", { enabledTracks: ["jp"], dailyGoal: 67, timezone: "Asia/Seoul", onyomiScript: "hiragana" }), fixture.env);
    expect(await patched.json()).toEqual({ enabledTracks: ["jp"], dailyGoal: 70, timezone: "Asia/Seoul", onyomiScript: "hiragana" });
    expect(await (await routeApiRequest(request("/api/settings"), fixture.env)).json()).toEqual({ enabledTracks: ["jp"], dailyGoal: 70, timezone: "Asia/Seoul", onyomiScript: "hiragana" });
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM review_states").get()).toEqual({ count: 1 });
    expect((await routeApiRequest(request("/api/settings", "PATCH", { enabledTracks: [] }), fixture.env)).status).toBe(400);
    const invalid = await routeApiRequest(request("/api/settings", "PATCH", { onyomiScript: "romaji" }), fixture.env);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: "invalid_settings" } });
  });

  it("persists placement results, marks onboarding complete, and selects a curriculum unit", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    fixture.sqlite.exec("UPDATE character_tracks SET level_ord = 2 WHERE track = 'kr' AND character_id IN (SELECT cum.character_id FROM curriculum_unit_members cum JOIN curriculum_units cu ON cu.id = cum.unit_id WHERE cu.track = 'kr' AND cu.ord >= 2)");
    fixture.sqlite.prepare("INSERT INTO placement_results (track, level_ord, level_badge, accuracy, detail, taken_at) VALUES ('jp', 1, '10級', 75, '기존 결과', 1)").run();
    const response = await routeApiRequest(request("/api/placement/score", "POST", { answers: [
      { characterKey: "金", track: "kr", correct: true, skipped: false, levelOrd: 2 },
      { characterKey: "大", track: "kr", correct: false, skipped: false, levelOrd: 2 },
    ] }), fixture.env);
    const placement = await response.json() as PlacementScoreResponse;
    expect(placement.results[0]).toMatchObject({ track: "kr", knownCount: 1, totalSeen: 2, accuracy: 50, levelBadge: "8급" });
    expect((await routeApiRequest(request("/api/placement/score", "POST", { answers: [{ characterKey: "金", track: "kr", correct: true, skipped: true, levelOrd: 2 }] }), fixture.env)).status).toBe(400);
    expect(await (await routeApiRequest(request("/api/onboarding-state"), fixture.env)).json()).toEqual({ onboarded: true });
    expect(fixture.sqlite.prepare("SELECT level_ord, detail FROM placement_results WHERE track = 'jp' ORDER BY taken_at DESC, id DESC LIMIT 1").get()).toEqual({ level_ord: 1, detail: "기존 결과" });
    expect(fixture.sqlite.prepare("SELECT track, COUNT(*) AS count FROM placement_results GROUP BY track ORDER BY track").all()).toEqual([{ track: "jp", count: 1 }, { track: "kr", count: 1 }]);
    const curriculum = await (await routeApiRequest(request("/api/curriculum?track=kr"), fixture.env)).json() as CurriculumResponse;
    expect(curriculum.units.filter((unit) => unit.current)).toHaveLength(1);
    expect(curriculum.units.find((unit) => unit.current)?.ord).toBe(2);
  });

  it("buckets 23:50 in the stored timezone and shares mastery and streak values", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    await routeApiRequest(request("/api/settings", "PATCH", { enabledTracks: ["kr"], timezone: "Asia/Seoul" }), fixture.env);
    const character = fixture.sqlite.prepare("SELECT id FROM characters WHERE key = '金'").get() as { id: number };
    fixture.sqlite.prepare("INSERT INTO review_states VALUES (?, 'kr', 8, 5, 1, 2, 0, 2, 0, 2, 0, 0, 1, 1)").run(character.id);
    fixture.sqlite.prepare("INSERT INTO review_log (character_id, track, rating, answered_at, correct, elapsed_ms, scheduled_days_before, scheduled_days_after, mode) VALUES (?, 'kr', 3, ?, 1, 1000, 1, 2, 'lesson')").run(character.id, Date.parse("2026-08-28T14:50:00Z"));
    const now = new Date("2026-08-28T15:30:00Z");
    const stats = await getStats(fixture.env.DB, now) as StatsResponse;
    expect(stats.calendar).toHaveLength(126);
    expect(stats.calendar.find((day) => day.date === "2026-08-28")?.count).toBe(1);
    expect(stats.calendar.find((day) => day.date === "2026-08-29")?.count).toBe(0);
    expect(stats.tracks[0]).toMatchObject({ track: "kr", known: 1, total: 50, pct: 2 });
    const curriculum = await (await routeApiRequest(request("/api/curriculum?track=kr"), fixture.env)).json() as CurriculumResponse;
    expect(curriculum.units.reduce((sum, unit) => sum + unit.progress.known, 0)).toBe(stats.tracks[0].known);
    expect((await getProfile(fixture.env.DB, now)).streak).toBe(stats.streak);
  });
});
