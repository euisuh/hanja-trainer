import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { CharacterDetailResponse, CreateSessionRequest, DueReviewsResponse, ProfileResponse, StartSessionResponse, SubmitReviewRequest, SubmitReviewResponse } from "../../src/shared/api";
import { emitSeedSql, parseSeed } from "../../scripts/seed";
import { applyMigrations } from "../test/schema";
import { getStats } from "./stats";
import { createSession } from "./sessions";
import { parseReviewRequest, submitReview, submitReviewBatch } from "./reviews";
import { routeApiRequest } from "./router";

function d1Result<T>(results: T[]): D1Result<T> {
  return { results, success: true, meta: { duration: 0, size_after: 0, rows_read: 0, rows_written: 0, last_row_id: 0, changed_db: false, changes: 0 } };
}

type QueryBudget = { bindingCalls: number; statements: number };

function d1(sqlite: DatabaseSync, budget: QueryBudget): D1Database {
  const adapter = Object.create(null) as D1Database;
  let batching = false;
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
    prepared.first = async <T>() => {
      if (!batching) { budget.bindingCalls += 1; budget.statements += 1; }
      return (sqlite.prepare(query).get(...values) as T | undefined) ?? null;
    };
    prepared.all = async <T>() => {
      if (!batching) { budget.bindingCalls += 1; budget.statements += 1; }
      return d1Result(sqlite.prepare(query).all(...values) as T[]);
    };
    prepared.run = async <T>() => {
      if (!batching) { budget.bindingCalls += 1; budget.statements += 1; }
      sqlite.prepare(query).run(...values);
      return d1Result<T>([]);
    };
    return prepared;
  };
  adapter.batch = async <T>(statements: D1PreparedStatement[]) => {
    budget.bindingCalls += 1;
    budget.statements += statements.length;
    batching = true;
    try { return await Promise.all(statements.map((statement) => statement.all<T>())); }
    finally { batching = false; }
  };
  return adapter;
}

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  const budget = { bindingCalls: 0, statements: 0 };
  applyMigrations(sqlite);
  sqlite.exec(emitSeedSql(parseSeed(JSON.parse(readFileSync("data/characters/kr-8geup.json", "utf8")) as unknown)));
  sqlite.exec(emitSeedSql(parseSeed(JSON.parse(readFileSync("data/characters/jp-jlpt-n5.json", "utf8")) as unknown)));
  sqlite.exec(emitSeedSql(parseSeed(JSON.parse(readFileSync("data/characters/cn-hsk1.json", "utf8")) as unknown)));
  return { sqlite, budget, env: { DB: d1(sqlite, budget) } as Env };
}

function post(path: string, body: unknown, env: Env) {
  return routeApiRequest(new Request(`https://test${path}`, { method: "POST", headers: { "content-type": "application/json", "x-hanja-profile-id": "1" }, body: JSON.stringify(body) }), env);
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

  it("keeps delayed batch answers on their Asia/Seoul calendar days", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const receivedAt = new Date("2026-09-08T01:00:00.000Z");
    const inputs: SubmitReviewRequest[] = [
      { sessionId: "midnight", cardIndex: 0, characterKey: "金", track: "kr", correct: true, skipped: false, elapsedMs: 1_000, mode: "lesson", answeredAt: "2026-09-07T14:59:00.000Z" },
      { sessionId: "midnight", cardIndex: 1, characterKey: "大", track: "kr", correct: true, skipped: false, elapsedMs: 1_000, mode: "lesson", answeredAt: "2026-09-07T15:01:00.000Z" },
    ];

    await submitReviewBatch(fixture.env.DB, 1, inputs, receivedAt);

    expect(fixture.sqlite.prepare("SELECT answered_at FROM review_log ORDER BY card_index").all()).toEqual(inputs.map(({ answeredAt }) => ({ answered_at: Date.parse(answeredAt!) })));
    const stats = await getStats(fixture.env.DB, 1, receivedAt);
    expect(stats.calendar.filter(({ date }) => date === "2026-09-07" || date === "2026-09-08")).toEqual([
      { date: "2026-09-07", count: 1 },
      { date: "2026-09-08", count: 1 },
    ]);
  });

  it("schedules from event time without moving state backward on late replay", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const receivedAt = new Date("2026-09-08T12:00:00.000Z");
    const base = { characterKey: "金", track: "kr", correct: true, skipped: false, elapsedMs: 1_000, mode: "review" } as const;
    const delayed: SubmitReviewRequest = { ...base, sessionId: "timing", cardIndex: 0, answeredAt: "2026-08-01T00:00:00.000Z" };
    const delayedResponse = await submitReview(fixture.env.DB, 1, delayed, receivedAt);
    expect(Date.parse(delayedResponse.due)).toBeLessThan(receivedAt.getTime());
    expect(fixture.sqlite.prepare("SELECT last_review FROM review_states").get()).toEqual({ last_review: Date.parse(delayed.answeredAt!) });

    const newer: SubmitReviewRequest = { ...base, sessionId: "timing", cardIndex: 1, answeredAt: "2026-09-07T00:00:00.000Z" };
    await submitReview(fixture.env.DB, 1, newer, receivedAt);
    const older: SubmitReviewRequest = { ...base, sessionId: "timing", cardIndex: 2, answeredAt: "2026-08-15T00:00:00.000Z" };
    const olderResponse = await submitReview(fixture.env.DB, 1, older, receivedAt);
    const state = fixture.sqlite.prepare("SELECT * FROM review_states").get();
    const logs = fixture.sqlite.prepare("SELECT answered_at FROM review_log ORDER BY card_index").all();
    expect(state).toMatchObject({ last_review: Date.parse(newer.answeredAt!), total_count: 3 });
    expect(logs).toEqual([delayed, newer, older].map(({ answeredAt }) => ({ answered_at: Date.parse(answeredAt!) })));

    expect(await submitReview(fixture.env.DB, 1, older, new Date("2026-09-09T12:00:00.000Z"))).toEqual(olderResponse);
    expect(fixture.sqlite.prepare("SELECT * FROM review_states").get()).toEqual(state);
    expect(fixture.sqlite.prepare("SELECT answered_at FROM review_log ORDER BY card_index").all()).toEqual(logs);
  });

  it("accepts legacy and old timestamps, clamps small skew, and rejects bad future time", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const receivedAt = new Date("2026-09-08T12:00:00.000Z");
    const base = { sessionId: "validation", cardIndex: 0, characterKey: "金", track: "kr", correct: true, skipped: false, elapsedMs: 1_000, mode: "lesson" } as const;
    expect(parseReviewRequest(base, receivedAt)).toEqual(base);
    expect(parseReviewRequest({ ...base, answeredAt: "2020-01-01T00:00:00.000Z" }, receivedAt)).not.toBeNull();
    expect(parseReviewRequest({ ...base, answeredAt: "2026-09-08T21:00:00+09:00" }, receivedAt)).not.toBeNull();
    expect(parseReviewRequest({ ...base, answeredAt: "not-a-date" }, receivedAt)).toBeNull();
    expect(parseReviewRequest({ ...base, answeredAt: "2026-09-08" }, receivedAt)).toBeNull();
    expect(parseReviewRequest({ ...base, answeredAt: "2026-02-30T00:00:00.000Z" }, receivedAt)).toBeNull();
    expect(parseReviewRequest({ ...base, answeredAt: new Date(receivedAt.getTime() + 5 * 60_000 + 1).toISOString() }, receivedAt)).toBeNull();

    await submitReview(fixture.env.DB, 1, base, receivedAt);
    const skewed = parseReviewRequest({ ...base, sessionId: "validation-skew", characterKey: "大", answeredAt: new Date(receivedAt.getTime() + 4 * 60_000).toISOString() }, receivedAt)!;
    await submitReview(fixture.env.DB, 1, skewed, receivedAt);
    expect(fixture.sqlite.prepare("SELECT answered_at FROM review_log ORDER BY id").all()).toEqual([
      { answered_at: receivedAt.getTime() },
      { answered_at: receivedAt.getTime() },
    ]);
  });

  it("uses each compound member's nondecreasing schedule time but logs one event time", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const inserted = fixture.sqlite.prepare("INSERT INTO words (track, glyph, reading, level, level_ord, source_url) VALUES ('kr', '學校', '학교', '8급', 1, 'https://example.test/word')").run();
    const wordId = Number(inserted.lastInsertRowid);
    for (const [position, key] of ["學", "校"].entries()) {
      fixture.sqlite.prepare("INSERT INTO word_members (word_id, character_id, position) SELECT ?, id, ? FROM characters WHERE key = ?").run(wordId, position, key);
    }
    const members = fixture.sqlite.prepare("SELECT character_id FROM word_members WHERE word_id = ? ORDER BY position").all(wordId) as Array<{ character_id: number }>;
    const eventTime = Date.parse("2026-09-07T00:00:00.000Z");
    const laterTime = Date.parse("2026-09-08T00:00:00.000Z");
    const insertState = fixture.sqlite.prepare("INSERT INTO review_states VALUES (1, ?, 'kr', 2, 5, 1, 2, 0, 2, 0, 2, ?, ?, 1, 1)");
    insertState.run(members[0].character_id, eventTime - DAY, eventTime - DAY);
    insertState.run(members[1].character_id, laterTime, laterTime);

    await submitReview(fixture.env.DB, 1, {
      sessionId: "timed-word", cardIndex: 0, characterKey: "學", wordId, track: "kr",
      correct: true, skipped: false, elapsedMs: 1_000, mode: "review", answeredAt: new Date(eventTime).toISOString(),
    }, new Date("2026-09-09T00:00:00.000Z"));

    expect(fixture.sqlite.prepare("SELECT answered_at FROM review_log WHERE session_id = 'timed-word' ORDER BY character_id").all()).toEqual([
      { answered_at: eventTime },
      { answered_at: eventTime },
    ]);
    expect(fixture.sqlite.prepare("SELECT character_id, last_review FROM review_states WHERE track = 'kr' AND character_id IN (?, ?) ORDER BY character_id").all(members[0].character_id, members[1].character_id)).toEqual([
      { character_id: members[0].character_id, last_review: eventTime },
      { character_id: members[1].character_id, last_review: laterTime },
    ].sort((a, b) => a.character_id - b.character_id));
  });

  it("starts a level review outside the due queue and updates real FSRS state", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const now = Date.now();
    fixture.sqlite.prepare(`
      INSERT INTO review_states (
        character_id, track, stability, difficulty, elapsed_days, scheduled_days,
        learning_steps, reps, lapses, state, last_review, due, correct_count, total_count
      )
      SELECT c.id, 'kr', 30, 5, 1, 30, 0, 3, 0, 2, ?, ?, 3, 3
      FROM characters c JOIN character_tracks ct ON ct.character_id = c.id
      WHERE ct.track = 'kr' AND ct.level_ord = 1
    `).run(now - DAY, now + 30 * DAY);

    const startResponse = await post("/api/session/start", { mode: "level-review", tracks: ["kr"], levelOrd: 1, limit: 8 }, fixture.env);
    expect(startResponse.status).toBe(200);
    const session = await startResponse.json() as StartSessionResponse;
    expect(session.cards).toHaveLength(8);
    expect(session.cards.every((card) => card.track === "kr" && card.levelOrd === 1)).toBe(true);

    const card = session.cards[0];
    const before = fixture.sqlite.prepare(`
      SELECT rs.correct_count, rs.total_count, rs.due
      FROM review_states rs JOIN characters c ON c.id = rs.character_id
      WHERE c.key = ? AND rs.track = 'kr'
    `).get(card.characterKey) as { correct_count: number; total_count: number; due: number };
    const answerResponse = await post("/api/reviews", { sessionId: session.sessionId, cardIndex: 0, characterKey: card.characterKey, track: "kr", correct: true, skipped: false, elapsedMs: 1_000, mode: "level-review" }, fixture.env);
    expect(answerResponse.status).toBe(200);
    const after = fixture.sqlite.prepare(`
      SELECT rs.correct_count, rs.total_count, rs.due
      FROM review_states rs JOIN characters c ON c.id = rs.character_id
      WHERE c.key = ? AND rs.track = 'kr'
    `).get(card.characterKey) as typeof before;
    expect(after).toMatchObject({ correct_count: before.correct_count + 1, total_count: before.total_count + 1 });
    expect(after.due).not.toBe(before.due);
    expect(fixture.sqlite.prepare("SELECT mode FROM review_log WHERE session_id = ?").get(session.sessionId)).toEqual({ mode: "level-review" });

    const endedAt = new Date().toISOString();
    expect((await post("/api/sessions", { mode: "level-review", startedAt: endedAt, endedAt, answered: 1, correct: 1, skipped: 0, bestCombo: 1, xp: 10 }, fixture.env)).status).toBe(200);
    expect(fixture.sqlite.prepare("SELECT mode FROM sessions ORDER BY id DESC LIMIT 1").get()).toEqual({ mode: "level-review" });
  });

  it("logs placement without creating state and returns ordered, uncapped due totals", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    await post("/api/reviews", { sessionId: "placement", cardIndex: 0, characterKey: "金", track: "kr", correct: true, skipped: false, elapsedMs: 2_000, mode: "placement" }, fixture.env);
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM review_log").get()).toEqual({ count: 1 });
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM review_states").get()).toEqual({ count: 0 });

    const ids = fixture.sqlite.prepare("SELECT id, key FROM characters ORDER BY id LIMIT 2").all() as Array<{ id: number; key: string }>;
    const insert = fixture.sqlite.prepare("INSERT INTO review_states VALUES (1, ?, 'kr', 2, 5, 1, 2, 0, 2, 0, 2, ?, ?, 1, 1)");
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
    const insertState = fixture.sqlite.prepare("INSERT INTO review_states VALUES (1, ?, 'kr', 2, 5, 1, 2, 0, 2, 0, 2, 1, 0, 1, 1)");
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

  it.each([
    { track: "jp" as const, glyph: "学校", reading: "がっこう", level: "N5", source: "https://ja.wiktionary.org/w/index.php?title=学校&oldid=2215211" },
    { track: "cn" as const, glyph: "学校", reading: "xué xiào", level: "HSK 1", source: "https://zh.wiktionary.org/w/index.php?title=學校&oldid=9870347" },
  ])("schedules both $track compound members in their shared FSRS states", async ({ track, glyph, reading, level, source }) => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const inserted = fixture.sqlite.prepare("INSERT INTO words (track, glyph, reading, level, level_ord, source_url) VALUES (?, ?, ?, ?, 1, ?)").run(track, glyph, reading, level, source);
    const wordId = Number(inserted.lastInsertRowid);
    for (const [position, key] of ["學", "校"].entries()) {
      fixture.sqlite.prepare("INSERT INTO word_members (word_id, character_id, position) SELECT ?, id, ? FROM characters WHERE key = ?").run(wordId, position, key);
    }
    const members = fixture.sqlite.prepare("SELECT character_id FROM word_members WHERE word_id = ? ORDER BY position").all(wordId) as Array<{ character_id: number }>;
    const insertState = fixture.sqlite.prepare(`
      INSERT INTO review_states
        (character_id, track, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, due, correct_count, total_count)
      VALUES (?, ?, 2, 5, 1, 2, 0, 2, 0, 2, 1, 0, 1, 1)
    `);
    for (const member of members) insertState.run(member.character_id, track);

    const input: SubmitReviewRequest = { sessionId: `${track}-word`, cardIndex: 3, characterKey: "學", wordId, track, correct: true, skipped: false, elapsedMs: 1_200, mode: "review" };
    expect((await post("/api/reviews", input, fixture.env)).status).toBe(200);
    expect(fixture.sqlite.prepare("SELECT character_id, track, correct_count FROM review_states WHERE track = ? ORDER BY character_id").all(track)).toEqual(
      members.map(({ character_id }) => ({ character_id, track, correct_count: 2 })).sort((a, b) => a.character_id - b.character_id),
    );
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM review_log WHERE session_id = ? AND track = ?").get(`${track}-word`, track)).toEqual({ count: 2 });
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
      await createSession(fixture.env.DB, 1, { mode: "lesson", startedAt: endedAt, endedAt, answered: 1, correct: 1, skipped: 0, bestCombo: 1, xp: 10 }, now);
    }
    const profile = await createSession(fixture.env.DB, 1, { mode: "review", startedAt: now.toISOString(), endedAt: now.toISOString(), answered: 2, correct: 1, skipped: 1, bestCombo: 1, xp: 12 }, now);
    expect(profile).toMatchObject<Partial<ProfileResponse>>({ xp: 32, todayXp: 12, streak: 3, longestStreak: 3 });
    expect(fixture.sqlite.prepare("SELECT skipped FROM sessions ORDER BY id DESC LIMIT 1").get()).toEqual({ skipped: 1 });
  });

  it("credits keyed summaries once across sequential, concurrent, and profile-scoped retries", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const now = new Date("2026-09-08T00:00:00.000Z");
    const summary = {
      sessionId: "lost-response",
      mode: "lesson",
      startedAt: now.toISOString(),
      endedAt: now.toISOString(),
      answered: 2,
      correct: 2,
      skipped: 0,
      bestCombo: 2,
      xp: 25,
    } as CreateSessionRequest & { sessionId: string };

    await createSession(fixture.env.DB, 1, summary, now);
    const replayed = await createSession(fixture.env.DB, 1, summary, now);
    expect(replayed.xp).toBe(25);

    const concurrent = { ...summary, sessionId: "concurrent" };
    await Promise.all([
      createSession(fixture.env.DB, 1, concurrent, now),
      createSession(fixture.env.DB, 1, concurrent, now),
    ]);
    expect(fixture.sqlite.prepare("SELECT xp FROM profile WHERE id = 1").get()).toEqual({ xp: 50 });
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM sessions WHERE profile_id = 1").get()).toEqual({ count: 2 });

    const secondProfileId = Number(fixture.sqlite.prepare("INSERT INTO profile (name) VALUES ('둘')").run().lastInsertRowid);
    const second = await createSession(fixture.env.DB, secondProfileId, concurrent, now);
    expect(second.xp).toBe(25);
    expect(fixture.sqlite.prepare("SELECT profile_id, client_session_id FROM sessions WHERE client_session_id = 'concurrent' ORDER BY profile_id").all()).toEqual([
      { profile_id: 1, client_session_id: "concurrent" },
      { profile_id: secondProfileId, client_session_id: "concurrent" },
    ]);
  });

  it("rejects malformed review, batch, due, and session inputs", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    expect((await post("/api/reviews", { sessionId: "x" }, fixture.env)).status).toBe(400);
    expect((await post("/api/reviews/batch", [], fixture.env)).status).toBe(400);
    expect((await routeApiRequest(new Request("https://test/api/reviews/due?tracks=xx&limit=-1"), fixture.env)).status).toBe(400);
    expect((await post("/api/sessions", { mode: "lesson", startedAt: "nope" }, fixture.env)).status).toBe(400);
    const validSession = { mode: "lesson", startedAt: new Date(0).toISOString(), endedAt: new Date(0).toISOString(), answered: 1, correct: 1, skipped: 0, bestCombo: 1, xp: 0 };
    expect((await post("/api/sessions", { ...validSession, sessionId: "" }, fixture.env)).status).toBe(400);
    expect((await post("/api/sessions", { ...validSession, sessionId: "x".repeat(129) }, fixture.env)).status).toBe(400);
    expect((await post("/api/sessions", { mode: "lesson", startedAt: new Date(0).toISOString(), endedAt: new Date(0).toISOString(), answered: 1, correct: 0, skipped: 2, bestCombo: 0, xp: 0 }, fixture.env)).status).toBe(400);
    expect((await post("/api/sessions", { mode: "lesson", startedAt: new Date(0).toISOString(), endedAt: new Date(0).toISOString(), answered: 1, correct: 1, skipped: 1, bestCombo: 0, xp: 0 }, fixture.env)).status).toBe(400);
  });

  it("keeps four compound reviews within one D1 request budget and idempotent", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const inserted = fixture.sqlite.prepare("INSERT INTO words (track, glyph, reading, level, level_ord, source_url) VALUES ('kr', '學校', '학교', '8급', 1, 'https://example.test/word')").run();
    const wordId = Number(inserted.lastInsertRowid);
    for (const [position, key] of ["學", "校"].entries()) {
      fixture.sqlite.prepare("INSERT INTO word_members (word_id, character_id, position) SELECT ?, id, ? FROM characters WHERE key = ?").run(wordId, position, key);
    }
    fixture.sqlite.prepare(`
      INSERT INTO review_states
        (character_id, track, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, due, correct_count, total_count)
      SELECT character_id, 'kr', 2, 5, 1, 2, 0, 2, 0, 2, 1, 0, 1, 1 FROM word_members WHERE word_id = ?
    `).run(wordId);
    const inputs = Array.from({ length: 4 }, (_, cardIndex): SubmitReviewRequest => ({
      sessionId: "word-batch", cardIndex, characterKey: "學", wordId, track: "kr",
      correct: cardIndex % 2 === 0, skipped: false, elapsedMs: cardIndex + 1, mode: "review",
    }));

    fixture.budget.bindingCalls = 0;
    fixture.budget.statements = 0;
    const accepted = await post("/api/reviews/batch", inputs, fixture.env);
    expect(accepted.status).toBe(200);
    expect(fixture.budget).toEqual({ bindingCalls: 21, statements: 37 });
    expect(fixture.sqlite.prepare("SELECT DISTINCT card_index FROM review_log WHERE session_id = 'word-batch' ORDER BY card_index").all()).toEqual(inputs.map(({ cardIndex }) => ({ card_index: cardIndex })));
    const states = fixture.sqlite.prepare("SELECT * FROM review_states ORDER BY character_id").all();

    fixture.budget.bindingCalls = 0;
    fixture.budget.statements = 0;
    expect((await post("/api/reviews/batch", inputs, fixture.env)).status).toBe(200);
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM review_log WHERE session_id = 'word-batch'").get()).toEqual({ count: 8 });
    expect(fixture.sqlite.prepare("SELECT * FROM review_states ORDER BY character_id").all()).toEqual(states);
    expect(fixture.budget).toEqual({ bindingCalls: 5, statements: 5 });
  });

  it("rejects an oversized review batch before writing anything", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const input: SubmitReviewRequest = { sessionId: "oversized", cardIndex: 0, characterKey: "金", track: "kr", correct: true, skipped: false, elapsedMs: 1, mode: "review" };
    const rejected = await post("/api/reviews/batch", Array.from({ length: 5 }, (_, cardIndex) => ({ ...input, cardIndex })), fixture.env);

    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({ error: { code: "invalid_review_batch", message: "body must be an array of 1 to 4 reviews" } });
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM review_log").get()).toEqual({ count: 0 });
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM review_states").get()).toEqual({ count: 0 });
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM review_submissions").get()).toEqual({ count: 0 });
  });
});

const DAY = 86_400_000;
