import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { CharacterDetailResponse, DueReviewsResponse, ProfileResponse, SubmitReviewRequest, SubmitReviewResponse } from "../../src/shared/api";
import { emitSeedSql, parseSeed } from "../../scripts/seed";
import { createSession } from "./sessions";
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
  for (const migration of ["0001_init.sql", "0002_fsrs.sql", "0003_sessions.sql", "0004_profile.sql", "0005_onyomi_script.sql", "0006_skipped.sql", "0007_pin.sql", "0008_unit_test_out.sql", "0009_stats_queries.sql", "0010_words.sql", "0013_sentence_readings.sql", "0015_curriculum_unit_level_ord.sql"]) sqlite.exec(readFileSync(`migrations/${migration}`, "utf8"));
  sqlite.exec(emitSeedSql(parseSeed(JSON.parse(readFileSync("data/characters/kr-8geup.json", "utf8")) as unknown)));
  return { sqlite, env: { DB: d1(sqlite) } as Env };
}

function post(path: string, body: unknown, env: Env) {
  return routeApiRequest(new Request(`https://test${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), env);
}

describe("review and session API", () => {
  const databases: DatabaseSync[] = [];
  afterEach(() => { for (const database of databases.splice(0)) database.close(); });

  it("schedules once per session card and exposes the state immediately", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const input: SubmitReviewRequest = { sessionId: "session-a", cardIndex: 0, characterKey: "金", track: "kr", correct: true, skipped: false, elapsedMs: 4_000, mode: "lesson" };
    const first = await post("/api/reviews", input, fixture.env);
    expect(first.status).toBe(200);
    const response = await first.json() as SubmitReviewResponse;
    const stateBeforeRetry = fixture.sqlite.prepare("SELECT * FROM review_states").get();
    const retry = await post("/api/reviews", input, fixture.env);
    expect(await retry.json()).toEqual(response);
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM review_log").get()).toEqual({ count: 1 });
    expect(fixture.sqlite.prepare("SELECT * FROM review_states").get()).toEqual(stateBeforeRetry);

    const detail = await routeApiRequest(new Request("https://test/api/characters/%E9%87%91"), fixture.env);
    const payload = await detail.json() as CharacterDetailResponse;
    expect(payload.tracks.find((track) => track.track === "kr")?.review_state).toMatchObject({ total_count: 1, correct_count: 1 });
  });

  it("logs placement without creating state and returns ordered, uncapped due totals", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    await post("/api/reviews", { sessionId: "placement", cardIndex: 0, characterKey: "金", track: "kr", correct: true, skipped: false, elapsedMs: 2_000, mode: "placement" }, fixture.env);
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM review_log").get()).toEqual({ count: 1 });
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM review_states").get()).toEqual({ count: 0 });

    const ids = fixture.sqlite.prepare("SELECT id, key FROM characters ORDER BY id LIMIT 2").all() as Array<{ id: number; key: string }>;
    const insert = fixture.sqlite.prepare("INSERT INTO review_states VALUES (?, 'kr', 2, 5, 1, 2, 0, 2, 0, 2, ?, ?, 1, 1)");
    insert.run(ids[0].id, Date.now() - DAY, Date.now() - DAY * 3);
    insert.run(ids[1].id, Date.now() - DAY, Date.now() - DAY);
    const dueResponse = await routeApiRequest(new Request("https://test/api/reviews/due?tracks=kr&limit=1"), fixture.env);
    const due = await dueResponse.json() as DueReviewsResponse;
    expect(due.total).toBe(2);
    expect(due.cards).toHaveLength(1);
    expect(due.cards[0].characterKey).toBe(ids[0].key);
  });

  it("schedules every compound constituent once for one submitted card", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const inserted = fixture.sqlite.prepare("INSERT INTO words (track, glyph, reading, level, level_ord, source_url) VALUES ('kr', '學校', '학교', '8급', 1, 'https://ko.wiktionary.org/w/index.php?title=학교&oldid=4219407')").run();
    const wordId = Number(inserted.lastInsertRowid);
    fixture.sqlite.prepare("INSERT INTO word_members (word_id, character_id, position) SELECT ?, id, ? FROM characters WHERE key = ?")
      .run(wordId, 0, "學");
    fixture.sqlite.prepare("INSERT INTO word_members (word_id, character_id, position) SELECT ?, id, ? FROM characters WHERE key = ?")
      .run(wordId, 1, "校");
    const input: SubmitReviewRequest = { sessionId: "word", cardIndex: 3, characterKey: "學", wordId, track: "kr", correct: true, skipped: false, elapsedMs: 1_200, mode: "lesson" };
    expect((await post("/api/reviews", input, fixture.env)).status).toBe(404);
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM review_states").get()).toEqual({ count: 0 });
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM review_log").get()).toEqual({ count: 0 });
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM review_submissions").get()).toEqual({ count: 0 });

    const members = fixture.sqlite.prepare("SELECT character_id FROM word_members WHERE word_id = ? ORDER BY position").all(wordId) as Array<{ character_id: number }>;
    const insertState = fixture.sqlite.prepare("INSERT INTO review_states VALUES (?, 'kr', 2, 5, 1, 2, 0, 2, 0, 2, 1, 0, 1, 1)");
    for (const member of members) insertState.run(member.character_id);
    expect((await post("/api/reviews", input, fixture.env)).status).toBe(200);
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM review_states").get()).toEqual({ count: 2 });
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM review_log WHERE session_id = 'word' AND card_index = 3").get()).toEqual({ count: 2 });
    const statesAfterSubmission = fixture.sqlite.prepare("SELECT character_id, correct_count, total_count FROM review_states ORDER BY character_id").all();
    expect(statesAfterSubmission).toEqual(members.map(({ character_id }) => ({ character_id, correct_count: 2, total_count: 2 })).sort((a, b) => a.character_id - b.character_id));

    expect((await post("/api/reviews", input, fixture.env)).status).toBe(200);
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM review_log WHERE session_id = 'word' AND card_index = 3").get()).toEqual({ count: 2 });
    expect(fixture.sqlite.prepare("SELECT character_id, correct_count, total_count FROM review_states ORDER BY character_id").all()).toEqual(statesAfterSubmission);
    expect((await post("/api/reviews", { ...input, sessionId: "forged-word", characterKey: "金" }, fixture.env)).status).toBe(404);
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM review_log").get()).toEqual({ count: 2 });

    const stats = await (await routeApiRequest(new Request("https://test/api/stats"), fixture.env)).json() as { answered: number; calendar: Array<{ count: number }> };
    expect(stats.answered).toBe(1);
    expect(stats.calendar.reduce((total, day) => total + day.count, 0)).toBe(1);
  });

  it("keeps submitted attempts distinct from legacy log identities", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const characters = fixture.sqlite.prepare("SELECT id, key FROM characters ORDER BY id LIMIT 2").all() as Array<{ id: number; key: string }>;
    fixture.sqlite.prepare(`
      INSERT INTO review_log
        (character_id, track, rating, answered_at, correct, elapsed_ms, scheduled_days_before, scheduled_days_after, mode, session_id, card_index, skipped)
      VALUES (?, 'kr', 1, ?, 0, 1, 0, 0, 'lesson', NULL, NULL, 1)
    `).run(characters[0].id, Date.now());
    expect((await post("/api/reviews", { sessionId: "log", cardIndex: 1, characterKey: characters[1].key, track: "kr", correct: false, skipped: true, elapsedMs: 1, mode: "lesson" }, fixture.env)).status).toBe(200);

    const stats = await (await routeApiRequest(new Request("https://test/api/stats"), fixture.env)).json() as { answered: number; skipped: number; calendar: Array<{ count: number }> };
    expect(stats).toMatchObject({ answered: 2, skipped: 2 });
    expect(stats.calendar.reduce((total, day) => total + day.count, 0)).toBe(2);
  });

  it("records skips separately and rejects correct skips", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    await post("/api/reviews", { sessionId: "wrong", cardIndex: 0, characterKey: "金", track: "kr", correct: false, skipped: false, elapsedMs: 1, mode: "lesson" }, fixture.env);
    await post("/api/reviews", { sessionId: "skip", cardIndex: 0, characterKey: "大", track: "kr", correct: false, skipped: true, elapsedMs: 999_999, mode: "lesson" }, fixture.env);
    const rows = fixture.sqlite.prepare("SELECT rating, correct, skipped, scheduled_days_after FROM review_log ORDER BY id").all();

    expect(rows).toEqual([
      { rating: 1, correct: 0, skipped: 0, scheduled_days_after: 0 },
      { rating: 1, correct: 0, skipped: 1, scheduled_days_after: 0 },
    ]);
    expect((await post("/api/reviews", { sessionId: "invalid", cardIndex: 0, characterKey: "金", track: "kr", correct: true, skipped: true, elapsedMs: 1, mode: "lesson" }, fixture.env)).status).toBe(400);
    const stats = await (await routeApiRequest(new Request("https://test/api/stats"), fixture.env)).json();
    expect(stats).toMatchObject({ answered: 2, skipped: 1, skipRate: 50 });
  });

  it("computes XP and streaks across a day boundary", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const now = new Date("2026-08-29T12:00:00Z");
    for (const endedAt of ["2026-08-27T12:00:00Z", "2026-08-28T12:00:00Z"]) {
      await createSession(fixture.env.DB, { mode: "lesson", startedAt: endedAt, endedAt, answered: 1, correct: 1, skipped: 0, bestCombo: 1, xp: 10 }, now);
    }
    const profile = await createSession(fixture.env.DB, { mode: "review", startedAt: now.toISOString(), endedAt: now.toISOString(), answered: 2, correct: 1, skipped: 1, bestCombo: 1, xp: 12 }, now);
    expect(profile).toMatchObject<Partial<ProfileResponse>>({ xp: 32, todayXp: 12, streak: 3, longestStreak: 3 });
    expect(fixture.sqlite.prepare("SELECT skipped FROM sessions ORDER BY id DESC LIMIT 1").get()).toEqual({ skipped: 1 });
  });

  it("rejects malformed review, batch, due, and session inputs", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    expect((await post("/api/reviews", { sessionId: "x" }, fixture.env)).status).toBe(400);
    expect((await post("/api/reviews/batch", [], fixture.env)).status).toBe(400);
    expect((await routeApiRequest(new Request("https://test/api/reviews/due?tracks=xx&limit=-1"), fixture.env)).status).toBe(400);
    expect((await post("/api/sessions", { mode: "lesson", startedAt: "nope" }, fixture.env)).status).toBe(400);
    expect((await post("/api/sessions", { mode: "lesson", startedAt: new Date(0).toISOString(), endedAt: new Date(0).toISOString(), answered: 1, correct: 0, skipped: 2, bestCombo: 0, xp: 0 }, fixture.env)).status).toBe(400);
    expect((await post("/api/sessions", { mode: "lesson", startedAt: new Date(0).toISOString(), endedAt: new Date(0).toISOString(), answered: 1, correct: 1, skipped: 1, bestCombo: 0, xp: 0 }, fixture.env)).status).toBe(400);
  });
});

const DAY = 86_400_000;
