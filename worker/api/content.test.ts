import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { CharacterDetailResponse, CurriculumResponse, StartSessionResponse } from "../../src/shared/api";
import { emitSeedSql, parseSeed } from "../../scripts/seed";
import { routeApiRequest } from "./router";

function d1Result<T>(results: T[]): D1Result<T> {
  return { results, success: true, meta: { duration: 0, size_after: 0, rows_read: 0, rows_written: 0, last_row_id: 0, changed_db: false, changes: 0 } };
}

function d1(sqlite: DatabaseSync): D1Database {
  const adapter = Object.create(null) as D1Database;
  adapter.prepare = (query: string) => {
    let values: SQLInputValue[] = [];
    const prepared = Object.create(null) as D1PreparedStatement;
    prepared.bind = (...bound: unknown[]) => {
      values = bound.map((value) => {
        if (typeof value === "string" || typeof value === "number" || typeof value === "bigint" || value === null) return value;
        throw new Error(`Unsupported test binding: ${String(value)}`);
      });
      return prepared;
    };
    prepared.first = async <T>() => (sqlite.prepare(query).get(...values) as T | undefined) ?? null;
    prepared.all = async <T>() => d1Result(sqlite.prepare(query).all(...values) as T[]);
    prepared.run = async <T>() => { sqlite.prepare(query).run(...values); return d1Result<T>([]); };
    return prepared;
  };
  adapter.batch = async <T>(statements: D1PreparedStatement[]) => Promise.all(statements.map((statement) => statement.all<T>()));
  return adapter;
}

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync("migrations/0001_init.sql", "utf8"));
  sqlite.exec(readFileSync("migrations/0002_fsrs.sql", "utf8"));
  sqlite.exec(readFileSync("migrations/0003_sessions.sql", "utf8"));
  sqlite.exec(readFileSync("migrations/0004_profile.sql", "utf8"));
  sqlite.exec(emitSeedSql(parseSeed(JSON.parse(readFileSync("data/characters/kr-8geup.json", "utf8")) as unknown)));
  const members = sqlite.prepare("SELECT character_id FROM curriculum_unit_members ORDER BY unit_id, ord LIMIT 3").all() as Array<{ character_id: number }>;
  const now = Date.now();
  const insertState = sqlite.prepare(`INSERT INTO review_states (character_id, track, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, due, correct_count, total_count) VALUES (?, 'kr', ?, 5, 1, 2, 0, 2, 0, 2, ?, ?, 2, 2)`);
  insertState.run(members[0].character_id, 8, now - 86_400_000, now - 172_800_000);
  insertState.run(members[1].character_id, 2, now - 86_400_000, now - 86_400_000);
  sqlite.prepare("INSERT INTO review_log (character_id, track, rating, answered_at, correct, elapsed_ms, scheduled_days_before, scheduled_days_after, mode) VALUES (?, 'kr', 3, ?, 1, 2000, 1, 2, 'lesson')").run(members[0].character_id, now - 86_400_000);
  return { sqlite, env: { DB: d1(sqlite) } as Env, members };
}

describe("content API", () => {
  const databases: DatabaseSync[] = [];
  afterEach(() => { for (const database of databases.splice(0)) database.close(); });

  it("returns curriculum state, detail history, and a clean 404", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const curriculumResponse = await routeApiRequest(new Request("https://test/api/curriculum?track=kr"), fixture.env);
    const curriculum = await curriculumResponse.json() as CurriculumResponse;
    expect(curriculumResponse.headers.get("content-type")).toContain("application/json");
    expect(curriculum.units[0].nodes.slice(0, 3).map((node) => node.state)).toEqual(["done", "current", "locked"]);
    expect(curriculum.units[0].progress).toMatchObject({ known: 1, total: 10 });

    const key = curriculum.units[0].nodes[0].key;
    const detailResponse = await routeApiRequest(new Request(`https://test/api/characters/${encodeURIComponent(key)}`), fixture.env);
    const detail = await detailResponse.json() as CharacterDetailResponse;
    expect(detail).toMatchObject({ key, meaning_en: expect.any(String), meaning_ko: expect.any(String) });
    expect(detail.tracks[0].review_state).toMatchObject({ stability: 8, interval_history: [2] });

    const missing = await routeApiRequest(new Request("https://test/api/characters/%E7%84%A1"), fixture.env);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: { code: "character_not_found" } });
    expect((await routeApiRequest(new Request("https://test/api/characters/%E0%A4%A"), fixture.env)).status).toBe(400);
  });

  it("builds exact, distinct session cards and orders review by due time", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const post = (body: unknown) => routeApiRequest(new Request("https://test/api/session/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), fixture.env);
    const lesson = await (await post({ mode: "lesson", tracks: ["kr"], limit: 6 })).json() as StartSessionResponse;
    expect(lesson.cards).toHaveLength(6);
    for (const card of lesson.cards.filter((item) => item.kind === "reading")) {
      expect(card.options).toHaveLength(4);
      expect(new Set(card.options.map((option) => option.label)).size).toBe(4);
      expect(card.answerIndex).toBeGreaterThanOrEqual(0);
      expect(card.options[card.answerIndex]).toBeDefined();
    }
    const review = await (await post({ mode: "review", tracks: ["kr"], limit: 2 })).json() as StartSessionResponse;
    expect(review.cards).toHaveLength(2);
    const keys = fixture.sqlite.prepare("SELECT c.key FROM review_states rs JOIN characters c ON c.id = rs.character_id ORDER BY rs.due").all().map((row) => (row as { key: string }).key);
    expect(review.cards.map((card) => card.characterKey)).toEqual(keys);
    const placement = await (await post({ mode: "placement", tracks: ["kr"], limit: 5 })).json() as StartSessionResponse;
    expect(placement.cards).toHaveLength(5);
  });

  it("rejects invalid tracks, limits, and malformed bodies as JSON 400s", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    expect((await routeApiRequest(new Request("https://test/api/curriculum?track=xx"), fixture.env)).status).toBe(400);
    for (const body of [{ mode: "lesson", tracks: ["xx"] }, { mode: "lesson", tracks: ["kr"], limit: -1 }, { mode: "lesson", tracks: ["kr"], limit: 51 }]) {
      const response = await routeApiRequest(new Request("https://test/api/session/start", { method: "POST", body: JSON.stringify(body) }), fixture.env);
      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("application/json");
    }
    const malformed = await routeApiRequest(new Request("https://test/api/session/start", { method: "POST", body: "{" }), fixture.env);
    expect(malformed.status).toBe(400);
  });
});
