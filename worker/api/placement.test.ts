import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emitSeedSql, parseSeed } from "../../scripts/seed";
import type { CurriculumResponse, PlacementAnswer, PlacementScoreResponse, StatsResponse } from "../../src/shared/api";
import { getProfile, zonedDayKey } from "./sessions";
import { getStats, kankenProgress } from "./stats";
import { routeApiRequest } from "./router";

type QueryObservation = { query: string; rows: number };

function result<T>(results: T[]): D1Result<T> {
  return { results, success: true, meta: { duration: 0, size_after: 0, rows_read: 0, rows_written: 0, last_row_id: 0, changed_db: false, changes: 0 } };
}

function d1(sqlite: DatabaseSync, observations: QueryObservation[]): D1Database {
  const adapter = Object.create(null) as D1Database;
  adapter.prepare = (query: string) => {
    let values: SQLInputValue[] = [];
    const statement = Object.create(null) as D1PreparedStatement;
    statement.bind = (...bound: unknown[]) => {
      values = bound.map((value) => typeof value === "string" || typeof value === "number" || typeof value === "bigint" || value === null ? value : (() => { throw new Error(`Unsupported binding: ${String(value)}`); })());
      return statement;
    };
    statement.first = async <T>() => (sqlite.prepare(query).get(...values) as T | undefined) ?? null;
    statement.all = async <T>() => {
      const rows = sqlite.prepare(query).all(...values) as T[];
      observations.push({ query, rows: rows.length });
      return result(rows);
    };
    statement.run = async <T>() => { sqlite.prepare(query).run(...values); return result<T>([]); };
    return statement;
  };
  adapter.batch = async <T>(statements: D1PreparedStatement[]) => Promise.all(statements.map((statement) => statement.all<T>()));
  return adapter;
}

function setup(observations: QueryObservation[] = []) {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of ["0001_init.sql", "0002_fsrs.sql", "0003_sessions.sql", "0004_profile.sql", "0005_onyomi_script.sql", "0006_skipped.sql", "0007_pin.sql", "0008_unit_test_out.sql", "0009_stats_queries.sql", "0011_theme.sql", "0012_theme_default.sql", "0013_sentence_readings.sql"]) sqlite.exec(readFileSync(`migrations/${migration}`, "utf8"));
  for (const path of ["data/characters/kr-8geup.json", "data/characters/jp-jlpt-n5.json", "data/characters/cn-hsk1.json"]) sqlite.exec(emitSeedSql(parseSeed(JSON.parse(readFileSync(path, "utf8")) as unknown)));
  return { sqlite, env: { DB: d1(sqlite, observations) } as Env };
}

function request(path: string, method = "GET", body?: unknown) {
  return new Request(`https://test${path}`, { method, headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}

describe("profile, placement, and stats API", () => {
  const databases: DatabaseSync[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    for (const database of databases.splice(0)) database.close();
  });

  it("finishes Kanken progress at the highest represented exact level", () => {
    const rows = ["10級", "9級", "8級", "7級", "6級", "5級"].map((level) => ({ level, stability: 99 }));
    expect(kankenProgress(rows)).toEqual({ name: "漢検", level: "5級", known: 1, total: 1 });
  });

  it("reuses one date formatter per timezone", () => {
    const DateTimeFormat = Intl.DateTimeFormat;
    const formatter = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (...args) { return new DateTimeFormat(...args); });
    const timezone = "Pacific/Kiritimati";
    expect(zonedDayKey(new Date("2026-01-01T09:59:00Z"), timezone)).toBe("2026-01-01");
    expect(zonedDayKey(new Date("2026-01-01T10:01:00Z"), timezone)).toBe("2026-01-02");
    expect(formatter.mock.calls.filter(([, options]) => options?.timeZone === timezone)).toHaveLength(1);
  });

  it("enforces one profile row and persists validated settings without deleting review state", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    expect(() => fixture.sqlite.prepare("INSERT INTO profile (id) VALUES (2)").run()).toThrow();
    expect(await (await routeApiRequest(request("/api/settings"), fixture.env)).json()).toMatchObject({ onyomiScript: "katakana", theme: "quiet-technical" });
    const character = fixture.sqlite.prepare("SELECT id FROM characters WHERE key = '金'").get() as { id: number };
    fixture.sqlite.prepare("INSERT INTO review_states VALUES (?, 'kr', 8, 5, 1, 2, 0, 2, 0, 2, 0, 0, 1, 1)").run(character.id);
    const patched = await routeApiRequest(request("/api/settings", "PATCH", { enabledTracks: ["jp"], dailyGoal: 67, timezone: "Asia/Seoul", onyomiScript: "hiragana", theme: "quiet-technical" }), fixture.env);
    expect(await patched.json()).toEqual({ enabledTracks: ["jp"], dailyGoal: 70, timezone: "Asia/Seoul", onyomiScript: "hiragana", theme: "quiet-technical" });
    expect(await (await routeApiRequest(request("/api/settings"), fixture.env)).json()).toEqual({ enabledTracks: ["jp"], dailyGoal: 70, timezone: "Asia/Seoul", onyomiScript: "hiragana", theme: "quiet-technical" });
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM review_states").get()).toEqual({ count: 1 });
    expect((await routeApiRequest(request("/api/settings", "PATCH", { enabledTracks: [] }), fixture.env)).status).toBe(400);
    const invalid = await routeApiRequest(request("/api/settings", "PATCH", { onyomiScript: "romaji" }), fixture.env);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: "invalid_settings" } });
    expect((await routeApiRequest(request("/api/settings", "PATCH", { theme: "ink-paper" }), fixture.env)).status).toBe(400);
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
    expect(placement.results[0]).toMatchObject({ track: "kr", knownCount: 1, totalSeen: 2, accuracy: 50, saturated: false, floored: false, levelBadge: "8급" });
    expect((await routeApiRequest(request("/api/placement/score", "POST", { answers: [{ characterKey: "金", track: "kr", correct: true, skipped: true, levelOrd: 2 }] }), fixture.env)).status).toBe(400);
    expect(await (await routeApiRequest(request("/api/onboarding-state"), fixture.env)).json()).toEqual({ onboarded: true });
    expect(fixture.sqlite.prepare("SELECT level_ord, detail FROM placement_results WHERE track = 'jp' ORDER BY taken_at DESC, id DESC LIMIT 1").get()).toEqual({ level_ord: 1, detail: "기존 결과" });
    expect(fixture.sqlite.prepare("SELECT track, COUNT(*) AS count FROM placement_results GROUP BY track ORDER BY track").all()).toEqual([{ track: "jp", count: 1 }, { track: "kr", count: 1 }]);
    const curriculum = await (await routeApiRequest(request("/api/curriculum?track=kr"), fixture.env)).json() as CurriculumResponse;
    expect(curriculum.units.filter((unit) => unit.current)).toHaveLength(1);
    expect(curriculum.units.find((unit) => unit.current)?.ord).toBe(2);
  });

  it("reports curriculum-bound ceiling and floor signals without changing the stored level", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    fixture.sqlite.exec("UPDATE character_tracks SET level_ord = 2, kr_level = '7급' WHERE track = 'kr' AND character_id IN (SELECT cum.character_id FROM curriculum_unit_members cum JOIN curriculum_units cu ON cu.id = cum.unit_id WHERE cu.track = 'kr' AND cu.ord >= 2)");

    const ceilingResponse = await routeApiRequest(request("/api/placement/score", "POST", { answers: [
      { characterKey: "金", track: "kr", correct: true, skipped: false, levelOrd: 1 },
      { characterKey: "大", track: "kr", correct: true, skipped: false, levelOrd: 2 },
    ] }), fixture.env);
    const ceiling = await ceilingResponse.json() as PlacementScoreResponse;
    expect(ceiling.results[0]).toMatchObject({ levelOrd: 2, levelBadge: "7급", saturated: true, floored: false, detail: "2/2문항 정확 · 현재 콘텐츠의 끝에 도달" });
    expect(fixture.sqlite.prepare("SELECT level_ord FROM placement_results WHERE track = 'kr' ORDER BY taken_at DESC, id DESC LIMIT 1").get()).toEqual({ level_ord: 2 });

    const floorResponse = await routeApiRequest(request("/api/placement/score", "POST", { answers: [
      { characterKey: "金", track: "kr", correct: false, skipped: false, levelOrd: 1 },
      { characterKey: "大", track: "kr", correct: false, skipped: false, levelOrd: 2 },
    ] }), fixture.env);
    const floor = await floorResponse.json() as PlacementScoreResponse;
    expect(floor.results[0]).toMatchObject({ levelOrd: 1, saturated: false, floored: true, detail: "0/2문항 정확 · 처음부터 시작" });
    expect(fixture.sqlite.prepare("SELECT level_ord FROM placement_results WHERE track = 'kr' ORDER BY taken_at DESC, id DESC LIMIT 1").get()).toEqual({ level_ord: 1 });

    fixture.sqlite.exec(`
      UPDATE character_tracks AS ct SET level_ord = (
        SELECT cu.ord FROM curriculum_unit_members cum
        JOIN curriculum_units cu ON cu.id = cum.unit_id
        WHERE cum.character_id = ct.character_id AND cu.track = ct.track
      ) WHERE track = 'kr'
    `);
    const curriculumRows = fixture.sqlite.prepare(`
      SELECT c.key, ct.level_ord FROM characters c
      JOIN character_tracks ct ON ct.character_id = c.id AND ct.track = 'kr'
      JOIN curriculum_unit_members cum ON cum.character_id = c.id
      JOIN curriculum_units cu ON cu.id = cum.unit_id AND cu.track = ct.track
      ORDER BY ct.level_ord, c.id
    `).all() as Array<{ key: string; level_ord: number }>;
    const keyAt = (levelOrd: number, offset = 0) => curriculumRows.filter((row) => row.level_ord === levelOrd)[offset].key;
    const recoveryLevels = [1, 1, 1, 2, 3, 4, ...Array<number>(9).fill(5)];
    const recoveryAnswers: PlacementAnswer[] = recoveryLevels.map((levelOrd, index) => ({
      characterKey: keyAt(levelOrd, levelOrd === 1 ? index : 0),
      track: "kr",
      correct: index >= 2,
      skipped: false,
      levelOrd,
    }));
    const recoveryResponse = await routeApiRequest(request("/api/placement/score", "POST", { answers: recoveryAnswers }), fixture.env);
    const recovery = await recoveryResponse.json() as PlacementScoreResponse;
    expect(recovery.results[0]).toMatchObject({ levelOrd: 5, saturated: true, floored: false, detail: "13/15문항 정확 · 현재 콘텐츠의 끝에 도달" });
    expect(fixture.sqlite.prepare("SELECT level_ord FROM placement_results WHERE track = 'kr' ORDER BY taken_at DESC, id DESC LIMIT 1").get()).toEqual({ level_ord: 5 });
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

  it("bounds event result sets by active days across a DST boundary", async () => {
    const observations: QueryObservation[] = [];
    const fixture = setup(observations); databases.push(fixture.sqlite);
    fixture.sqlite.exec("UPDATE profile SET enabled_tracks = '[\"kr\"]', timezone = 'America/New_York'");
    const character = fixture.sqlite.prepare("SELECT id FROM characters WHERE key = '金'").get() as { id: number };
    const moments = [
      "2026-03-07T04:30:00Z", // March 6, 23:30 EST
      "2026-03-07T05:30:00Z", // March 7, 00:30 EST
      "2026-03-08T04:30:00Z", // March 7, 23:30 EST
      "2026-03-08T05:30:00Z", // March 8, 00:30 EST
      "2026-03-09T03:30:00Z", // March 8, 23:30 EDT
      "2026-03-09T04:30:00Z", // March 9, 00:30 EDT
    ].map(Date.parse);
    const insert = fixture.sqlite.prepare(`
      INSERT INTO review_log
        (character_id, track, rating, answered_at, correct, elapsed_ms, scheduled_days_before, scheduled_days_after, mode, skipped)
      VALUES (?, 'kr', 3, ?, 1, 1000, 1, 2, 'lesson', ?)
    `);
    fixture.sqlite.exec("BEGIN");
    for (let index = 0; index < 3_000; index += 1) insert.run(character.id, moments[index % moments.length], index % 3 === 0 ? 1 : 0);
    fixture.sqlite.exec("COMMIT");
    fixture.sqlite.prepare(`
      INSERT INTO sessions (mode, started_at, ended_at, answered, correct, skipped, best_combo, xp)
      VALUES ('lesson', ?1, ?1, 1, 1, 0, 1, ?2)
    `).run(Date.parse("2026-03-08T16:00:00Z"), 5);
    fixture.sqlite.prepare(`
      INSERT INTO sessions (mode, started_at, ended_at, answered, correct, skipped, best_combo, xp)
      VALUES ('lesson', ?1, ?1, 1, 1, 0, 1, ?2)
    `).run(Date.parse("2026-03-09T16:00:00Z"), 7);

    const now = new Date("2026-03-09T17:00:00Z");
    const profile = await getProfile(fixture.env.DB, now);
    const stats = await getStats(fixture.env.DB, now);

    expect(profile).toMatchObject({ todayXp: 7, streak: 4, longestStreak: 4 });
    expect(stats).toMatchObject({ answered: 3_000, skipped: 1_000, skipRate: 1_000 / 3_000 * 100, streak: 4, longestStreak: 4 });
    expect(stats.calendar.filter((day) => day.count > 0)).toEqual([
      { date: "2026-03-06", count: 500 },
      { date: "2026-03-07", count: 1_000 },
      { date: "2026-03-08", count: 1_000 },
      { date: "2026-03-09", count: 500 },
    ]);
    const eventQueries = observations.filter(({ query }) => /\b(?:review_log|sessions)\b/.test(query));
    expect(eventQueries.length).toBeGreaterThan(0);
    expect(Math.max(...eventQueries.map(({ rows }) => rows))).toBe(4);
  });
});
