import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { CharacterDetailResponse, CurriculumResponse, StartSessionResponse, StatsResponse, UnitStudyResponse, UnitTestAnswer, UnitTestResult } from "../../src/shared/api";
import { emitSeedSql, emitSentenceSeedSql, emitWordSeedSql, levelOrdFor, parseSeed, parseSentenceSeed, parseWordSeed } from "../../scripts/seed";
import type { Track } from "../../src/shared/types";
import { unitTestRetryOffset } from "../../src/shared/unitTestRetry";
import { listForTracks } from "../db/characters";
import { applyMigrations } from "../test/schema";
import { startSession } from "./cards";
import { routeApiRequest } from "./router";

const CHARACTER_FILES = [
  "data/characters/cn-hsk1.json",
  "data/characters/cn-hsk2.json",
  "data/characters/jp-jlpt-n5.json",
  "data/characters/jp-jlpt-n4.json",
  "data/characters/jp-jlpt-n3.json",
  "data/characters/jp-jlpt-n2.json",
  "data/characters/jp-jlpt-n1.json",
  "data/characters/kr-7geup.json",
  "data/characters/kr-8geup.json",
];

const KR_THROUGH_4_FILES = [
  "data/characters/kr-8geup.json",
  "data/characters/kr-7geup.json",
  "data/characters/kr-6geup2.json",
  "data/characters/kr-6geup.json",
  "data/characters/kr-5geup2.json",
  "data/characters/kr-5geup.json",
  "data/characters/kr-4geup2.json",
  "data/characters/kr-4geup.json",
];

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
  applyMigrations(sqlite);
  sqlite.exec(emitSeedSql(parseSeed(JSON.parse(readFileSync("data/characters/kr-8geup.json", "utf8")) as unknown)));
  for (const level of ["n5", "n4", "n3", "n2", "n1"]) {
    sqlite.exec(emitSeedSql(parseSeed(JSON.parse(readFileSync(`data/characters/jp-jlpt-${level}.json`, "utf8")) as unknown)));
  }
  sqlite.exec(emitSentenceSeedSql(parseSentenceSeed(JSON.parse(readFileSync("data/sentences/kr-8geup.json", "utf8")) as unknown)));
  sqlite.exec(emitSentenceSeedSql(parseSentenceSeed(JSON.parse(readFileSync("data/sentences/jp-kanken-10.json", "utf8")) as unknown)));
  const members = sqlite.prepare("SELECT character_id FROM curriculum_unit_members ORDER BY unit_id, ord LIMIT 3").all() as Array<{ character_id: number }>;
  const now = Date.now();
  const insertState = sqlite.prepare(`INSERT INTO review_states (character_id, track, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, due, correct_count, total_count) VALUES (?, 'kr', ?, 5, 1, 2, 0, 2, 0, 2, ?, ?, 2, 2)`);
  insertState.run(members[0].character_id, 8, now - 86_400_000, now - 172_800_000);
  insertState.run(members[1].character_id, 2, now - 86_400_000, now - 86_400_000);
  sqlite.prepare("INSERT INTO review_log (character_id, track, rating, answered_at, correct, elapsed_ms, scheduled_days_before, scheduled_days_after, mode) VALUES (?, 'kr', 3, ?, 1, 2000, 1, 2, 'lesson')").run(members[0].character_id, now - 86_400_000);
  return { sqlite, env: { DB: d1(sqlite) } as Env, members };
}

function setupSeeds(files: string[]) {
  const sqlite = new DatabaseSync(":memory:");
  applyMigrations(sqlite);
  for (const file of files) sqlite.exec(emitSeedSql(parseSeed(JSON.parse(readFileSync(file, "utf8")) as unknown)));
  return { sqlite, env: { DB: d1(sqlite) } as Env };
}

function expectedOrder(track: Track): string[] {
  const entries = new Map<string, { levelOrd: number; unitOrd: number; memberOrd: number }>();
  for (const file of CHARACTER_FILES) {
    const document = parseSeed(JSON.parse(readFileSync(file, "utf8")) as unknown);
    for (const character of document.characters) {
      const entry = character.tracks.find((candidate) => candidate.track === track);
      if (entry) {
        const existing = entries.get(character.key);
        if (existing) existing.levelOrd = entry.levelOrd;
        else entries.set(character.key, { levelOrd: entry.levelOrd, unitOrd: Infinity, memberOrd: Infinity });
      }
    }
    for (const unit of document.curriculumUnits ?? []) {
      if (unit.track !== track) continue;
      for (const member of unit.members) {
        const entry = entries.get(member.key)!;
        if (unit.ord < entry.unitOrd || (unit.ord === entry.unitOrd && member.ord < entry.memberOrd)) {
          entry.unitOrd = unit.ord;
          entry.memberOrd = member.ord;
        }
      }
    }
  }
  return [...entries].sort(([keyA, a], [keyB, b]) =>
    a.levelOrd - b.levelOrd || a.unitOrd - b.unitOrd || a.memberOrd - b.memberOrd || keyA.localeCompare(keyB),
  ).map(([key]) => key);
}

function recoveredUnitTestAnswers(session: StartSessionResponse, mistakeLimit: number): UnitTestAnswer[] {
  const pending = session.cards.map((_, index) => index);
  const answers: UnitTestAnswer[] = [];
  let mistakes = 0;
  while (pending.length > 0) {
    const originalCardIndex = pending.shift()!;
    const card = session.cards[originalCardIndex];
    const shouldMiss = originalCardIndex === 0 && mistakes < mistakeLimit;
    answers.push({ cardIndex: originalCardIndex, characterKey: card.characterKey, selectedIndex: shouldMiss ? null : card.answerIndex });
    if (!shouldMiss) continue;
    mistakes += 1;
    if (mistakes >= 3) break;
    const currentQueuePosition = answers.length - 1;
    const offset = unitTestRetryOffset({ sessionId: session.sessionId, originalCardIndex, mistakeNumber: mistakes, currentQueuePosition, remainingLength: pending.length });
    pending.splice(offset, 0, originalCardIndex);
  }
  return answers;
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

    const unitResponse = await routeApiRequest(new Request(`https://test/api/curriculum/units/${curriculum.units[0].id}`), fixture.env);
    const unit = await unitResponse.json() as UnitStudyResponse;
    expect(unitResponse.status).toBe(200);
    expect(unit.unit).toMatchObject({ id: curriculum.units[0].id, track: "kr", level: curriculum.units[0].level, title: curriculum.units[0].title });
    expect(unit.characters.map((character) => character.key)).toEqual(curriculum.units[0].nodes.map((node) => node.key));
    expect(unit.characters[0].tracks).toEqual(expect.arrayContaining([
      expect.objectContaining({ track: "kr", reading: expect.any(String), meaning: expect.any(String), level_badges: expect.any(Array), sentences: expect.any(Array) }),
      expect.objectContaining({ track: "jp", reading: expect.any(String), meaning: expect.any(String), level_badges: expect.any(Array), sentences: expect.any(Array) }),
    ]));
    expect((await routeApiRequest(new Request("https://test/api/curriculum/units/0"), fixture.env)).status).toBe(400);
    expect((await routeApiRequest(new Request("https://test/api/curriculum/units/999999"), fixture.env)).status).toBe(404);

    const key = curriculum.units[0].nodes[0].key;
    const detailResponse = await routeApiRequest(new Request(`https://test/api/characters/${encodeURIComponent(key)}`), fixture.env);
    const detail = await detailResponse.json() as CharacterDetailResponse;
    expect(detail).toMatchObject({ key, meaning_en: expect.any(String), meaning_ko: expect.any(String) });
    expect(detail.tracks[0].review_state).toMatchObject({ stability: 8, interval_history: [2] });

    const sentenceRows = fixture.sqlite.prepare("SELECT c.key, es.track FROM example_sentences es JOIN characters c ON c.id = es.character_id WHERE es.id = (SELECT MIN(other.id) FROM example_sentences other WHERE other.track = es.track) ORDER BY es.track").all() as Array<{ key: string; track: Track }>;
    for (const row of sentenceRows) {
      const response = await routeApiRequest(new Request(`https://test/api/characters/${encodeURIComponent(row.key)}`), fixture.env);
      const sentence = ((await response.json()) as CharacterDetailResponse).tracks.find((track) => track.track === row.track)?.sentences[0];
      expect(sentence?.reading).toEqual(row.track === "kr" ? null : expect.any(String));
    }

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
    expect(lesson.cards.every((card) => card.meaningKo.length > 0)).toBe(true);
    expect(new Set(lesson.cards.map((card) => card.kind))).toEqual(new Set(["reading", "meaning"]));
    for (const card of lesson.cards.filter((item) => item.kind === "meaning")) {
      expect(card.prompt).toBe("뜻을 고르세요");
      expect(card.meaning).toBe(card.meaningKo);
      expect(card.options[card.answerIndex]?.label).toBe(card.meaning);
      expect(card.reading).not.toBe(card.meaning);
    }
    for (const card of lesson.cards) {
      expect(card.options).toHaveLength(4);
      expect(new Set(card.options.map((option) => option.label)).size).toBe(4);
      expect(card.options.every((option) => Object.keys(option).join() === "label")).toBe(true);
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

  it("starts exact unit tests and validates their mode, track, unit, and enabled settings", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const post = (body: unknown) => routeApiRequest(new Request("https://test/api/session/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), fixture.env);
    const unit = fixture.sqlite.prepare("SELECT id FROM curriculum_units WHERE track = 'kr' ORDER BY ord LIMIT 1").get() as { id: number };
    const keys = (fixture.sqlite.prepare("SELECT c.key FROM curriculum_unit_members cum JOIN characters c ON c.id = cum.character_id WHERE cum.unit_id = ? ORDER BY cum.ord").all(unit.id) as Array<{ key: string }>).map((row) => row.key);

    const response = await post({ mode: "lesson", tracks: ["kr"], unitId: unit.id, testOut: true });
    const session = await response.json() as StartSessionResponse;
    expect(response.status).toBe(200);
    expect(session.shortage).toBeUndefined();
    expect(session.cards).toHaveLength(keys.length * 2);
    expect(session.cards.every((card) => card.kind === "reading" && card.track === "kr" && card.options.length === 4)).toBe(true);
    expect(new Set(session.cards.map((card) => card.characterKey))).toEqual(new Set(keys));
    expect(keys.every((key) => session.cards.filter((card) => card.characterKey === key).length === 2)).toBe(true);
    expect(keys.every((key) => {
      const [first, second] = session.cards.filter((card) => card.characterKey === key);
      return first.answerIndex !== second.answerIndex;
    })).toBe(true);
    expect(fixture.sqlite.prepare("SELECT unit_id, consumed_at FROM curriculum_unit_test_attempts WHERE session_id = ?").get(session.sessionId)).toEqual({ unit_id: unit.id, consumed_at: null });

    for (const body of [
      { mode: "review", tracks: ["kr"], unitId: unit.id, testOut: true },
      { mode: "lesson", tracks: ["kr", "jp"], unitId: unit.id, testOut: true },
      { mode: "lesson", tracks: ["kr"], testOut: true },
      { mode: "lesson", tracks: ["kr"], unitId: unit.id, testOut: false },
    ]) expect((await post(body)).status).toBe(400);

    const mismatched = await post({ mode: "lesson", tracks: ["jp"], unitId: unit.id, testOut: true });
    expect(mismatched.status).toBe(400);
    expect(await mismatched.json()).toMatchObject({ error: { code: "unit_track_mismatch" } });

    fixture.sqlite.exec("UPDATE profile SET enabled_tracks = '[\"jp\"]'");
    const disabled = await post({ mode: "lesson", tracks: ["kr"], unitId: unit.id, testOut: true });
    expect(disabled.status).toBe(409);
    expect(await disabled.json()).toMatchObject({ error: { code: "unit_track_disabled" } });

    fixture.sqlite.exec("UPDATE profile SET enabled_tracks = '[\"kr\",\"jp\",\"cn\"]'");
    const future = fixture.sqlite.prepare("SELECT id FROM curriculum_units WHERE track = 'kr' ORDER BY ord LIMIT 1 OFFSET 1").get() as { id: number };
    const futureResponse = await post({ mode: "lesson", tracks: ["kr"], unitId: future.id, testOut: true });
    expect(futureResponse.status).toBe(409);
    expect(await futureResponse.json()).toMatchObject({ error: { code: "unit_not_current" } });

    fixture.sqlite.prepare(`
      INSERT INTO curriculum_unit_completion_members (unit_id, character_id, completed_at)
      SELECT unit_id, character_id, 1 FROM curriculum_unit_members WHERE unit_id = ?
    `).run(unit.id);
    const completeResponse = await post({ mode: "lesson", tracks: ["kr"], unitId: unit.id, testOut: true });
    expect(completeResponse.status).toBe(409);
    expect(await completeResponse.json()).toMatchObject({ error: { code: "unit_already_complete" } });
  });

  it("scores only issued one-time unit-test challenges and never mutates FSRS", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const post = (unitId: number, sessionId: string, answers: UnitTestAnswer[]) => routeApiRequest(new Request(`https://test/api/curriculum/units/${unitId}/test-out`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, answers }),
    }), fixture.env);
    const start = async (unitId: number, sessionId: string) => startSession(fixture.env.DB, { mode: "lesson", tracks: ["kr"], limit: 8, unitId, testOut: true }, sessionId);
    const answersFor = (session: StartSessionResponse): UnitTestAnswer[] => session.cards.map((card, cardIndex) => ({ cardIndex, characterKey: card.characterKey, selectedIndex: card.answerIndex }));
    const unit = fixture.sqlite.prepare("SELECT id FROM curriculum_units WHERE track = 'kr' ORDER BY ord LIMIT 1").get() as { id: number };
    const otherUnit = fixture.sqlite.prepare("SELECT id FROM curriculum_units WHERE track = 'kr' ORDER BY ord LIMIT 1 OFFSET 1").get() as { id: number };
    const beforeReviews = fixture.sqlite.prepare("SELECT * FROM review_states ORDER BY character_id, track").all();
    const beforeCurriculum = await (await routeApiRequest(new Request("https://test/api/curriculum?track=kr"), fixture.env)).json() as CurriculumResponse;

    const missing = await post(unit.id, "not-issued", []);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: { code: "unit_test_attempt_not_found" } });

    const wrongUnitSession = await start(unit.id, "wrong-unit");
    const wrongUnit = await post(otherUnit.id, wrongUnitSession.sessionId, answersFor(wrongUnitSession));
    expect(wrongUnit.status).toBe(409);
    expect(await wrongUnit.json()).toMatchObject({ error: { code: "unit_test_wrong_unit" } });

    const forgedSession = await start(unit.id, "forged");
    const forgedAnswers = answersFor(forgedSession);
    forgedAnswers[0] = { ...forgedAnswers[0], characterKey: "not-issued" };
    const forged = await post(unit.id, forgedSession.sessionId, forgedAnswers);
    expect(forged.status).toBe(400);
    expect(await forged.json()).toMatchObject({ error: { code: "unit_test_answers_mismatch" } });
    expect((await post(unit.id, forgedSession.sessionId, answersFor(forgedSession))).status).toBe(409);
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM curriculum_unit_test_attempts").get()).toEqual({ count: 1 });

    const failedSession = await start(unit.id, "failed");
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM curriculum_unit_test_attempts").get()).toEqual({ count: 1 });
    const superseded = await post(unit.id, forgedSession.sessionId, answersFor(forgedSession));
    expect(superseded.status).toBe(404);
    expect(await superseded.json()).toMatchObject({ error: { code: "unit_test_attempt_not_found" } });
    const recoverableAnswers = recoveredUnitTestAnswers(failedSession, 1);
    const recoveryIndex = recoverableAnswers.findIndex((answer, index) => index > 0 && answer.cardIndex === 0);
    const failedAnswers = recoverableAnswers.slice(0, recoveryIndex);
    const failed = await (await post(unit.id, failedSession.sessionId, failedAnswers)).json() as UnitTestResult;
    expect(failed).toEqual({ passed: false, correct: failedAnswers.length - 1, total: failedAnswers.length, required: failedSession.cards.length, mistakes: 1 });
    const failedReplay = await post(unit.id, failedSession.sessionId, answersFor(failedSession));
    expect(failedReplay.status).toBe(409);
    expect(await failedReplay.json()).toMatchObject({ error: { code: "unit_test_replayed" } });

    const invalidIndexSession = await start(unit.id, "invalid-index");
    const invalidIndexAnswers = answersFor(invalidIndexSession);
    invalidIndexAnswers[0] = { ...invalidIndexAnswers[0], cardIndex: invalidIndexAnswers.length };
    const invalidIndex = await post(unit.id, invalidIndexSession.sessionId, invalidIndexAnswers);
    expect(invalidIndex.status).toBe(400);
    expect(await invalidIndex.json()).toMatchObject({ error: { code: "unit_test_answers_mismatch" } });

    const outOfOrderSession = await start(unit.id, "out-of-order");
    const outOfOrderAnswers = answersFor(outOfOrderSession);
    const outOfOrder = await post(unit.id, outOfOrderSession.sessionId, [outOfOrderAnswers[1]]);
    expect(outOfOrder.status).toBe(400);
    expect(await outOfOrder.json()).toMatchObject({ error: { code: "unit_test_answers_mismatch" } });

    const immediateRetrySession = await start(unit.id, "immediate-retry");
    const immediateRetryAnswers = answersFor(immediateRetrySession);
    const immediateRetry = await post(unit.id, immediateRetrySession.sessionId, [
      { ...immediateRetryAnswers[0], selectedIndex: null },
      immediateRetryAnswers[0],
    ]);
    expect(immediateRetry.status).toBe(400);
    expect(await immediateRetry.json()).toMatchObject({ error: { code: "unit_test_answers_mismatch" } });

    const invalidSequenceSession = await start(unit.id, "invalid-sequence");
    const invalidSequenceAnswers = answersFor(invalidSequenceSession);
    invalidSequenceAnswers.splice(1, 0, invalidSequenceAnswers[0]);
    const invalidSequence = await post(unit.id, invalidSequenceSession.sessionId, invalidSequenceAnswers);
    expect(invalidSequence.status).toBe(400);
    expect(await invalidSequence.json()).toMatchObject({ error: { code: "unit_test_answers_mismatch" } });

    const thirdMistakeSession = await start(unit.id, "third-mistake");
    const thirdMistakeAnswers = recoveredUnitTestAnswers(thirdMistakeSession, 3);
    const thirdMistake = await (await post(unit.id, thirdMistakeSession.sessionId, thirdMistakeAnswers)).json() as UnitTestResult;
    expect(thirdMistake).toEqual({ passed: false, correct: thirdMistakeAnswers.filter((answer) => answer.selectedIndex !== null).length, total: thirdMistakeAnswers.length, required: thirdMistakeSession.cards.length, mistakes: 3 });

    const afterEndSession = await start(unit.id, "after-end");
    const afterEndAnswers = recoveredUnitTestAnswers(afterEndSession, 3);
    afterEndAnswers.push(answersFor(afterEndSession)[0]);
    const afterEnd = await post(unit.id, afterEndSession.sessionId, afterEndAnswers);
    expect(afterEnd.status).toBe(400);
    expect(await afterEnd.json()).toMatchObject({ error: { code: "unit_test_answers_mismatch" } });

    fixture.sqlite.prepare(`
      INSERT INTO curriculum_unit_test_attempts
        (session_id, unit_id, expected_answers, created_at, expires_at, consumed_at, consumed_token)
      VALUES ('expired-other-unit', ?, '[]', 0, 1, NULL, NULL)
    `).run(otherUnit.id);
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM curriculum_unit_test_attempts").get()).toEqual({ count: 2 });
    const expiredSession = await start(unit.id, "expired");
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM curriculum_unit_test_attempts").get()).toEqual({ count: 1 });
    fixture.sqlite.prepare("UPDATE curriculum_unit_test_attempts SET expires_at = 1 WHERE session_id = ?").run(expiredSession.sessionId);
    const expired = await post(unit.id, expiredSession.sessionId, answersFor(expiredSession));
    expect(expired.status).toBe(410);
    expect(await expired.json()).toMatchObject({ error: { code: "unit_test_expired" } });
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM curriculum_unit_completion_members").get()).toEqual({ count: 0 });

    const passedSession = await start(unit.id, "passed");
    const passedAnswers = answersFor(passedSession);
    expect(await (await post(unit.id, passedSession.sessionId, passedAnswers)).json()).toEqual({ passed: true, correct: passedAnswers.length, total: passedAnswers.length, required: passedAnswers.length, mistakes: 0 });
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM curriculum_unit_completion_members WHERE unit_id = ?").get(unit.id)).toEqual({ count: passedAnswers.length / 2 });
    const passedReplay = await post(unit.id, passedSession.sessionId, passedAnswers);
    expect(passedReplay.status).toBe(409);
    expect(await passedReplay.json()).toMatchObject({ error: { code: "unit_test_replayed" } });
    expect(fixture.sqlite.prepare("SELECT * FROM review_states ORDER BY character_id, track").all()).toEqual(beforeReviews);

    const completed = await (await routeApiRequest(new Request("https://test/api/curriculum?track=kr"), fixture.env)).json() as CurriculumResponse;
    expect(completed.units[0].progress.known).toBe(beforeCurriculum.units[0].progress.known);
    expect(completed.units[0].nodes.every((node) => node.state === "done")).toBe(true);
    expect(completed.units[0].current).toBe(false);
    expect(completed.units[1].current).toBe(true);

    const added = fixture.sqlite.prepare(`
      SELECT ct.character_id FROM character_tracks ct
      WHERE ct.track = 'kr' AND NOT EXISTS (
        SELECT 1 FROM curriculum_unit_members cum WHERE cum.unit_id = ? AND cum.character_id = ct.character_id
      )
      ORDER BY ct.character_id LIMIT 1
    `).get(unit.id) as { character_id: number };
    fixture.sqlite.prepare("INSERT INTO curriculum_unit_members (unit_id, character_id, ord) VALUES (?, ?, (SELECT MAX(ord) + 1 FROM curriculum_unit_members WHERE unit_id = ?))").run(unit.id, added.character_id, unit.id);
    const invalidated = await (await routeApiRequest(new Request("https://test/api/curriculum?track=kr"), fixture.env)).json() as CurriculumResponse;
    expect(invalidated.units[0].current).toBe(true);
    expect(invalidated.units[0].nodes.some((node) => node.state !== "done")).toBe(true);

    const expanded = await start(unit.id, "expanded-membership");
    const expandedAnswers = answersFor(expanded);
    expect(await (await post(unit.id, expanded.sessionId, expandedAnswers)).json()).toEqual({ passed: true, correct: expandedAnswers.length, total: expandedAnswers.length, required: expandedAnswers.length, mistakes: 0 });
    expect(fixture.sqlite.prepare("SELECT * FROM review_states ORDER BY character_id, track").all()).toEqual(beforeReviews);
  });

  it.each([1, 2])("passes a complete issued challenge after recovering from %i mistake(s)", async (mistakes) => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const unit = fixture.sqlite.prepare("SELECT id FROM curriculum_units WHERE track = 'kr' ORDER BY ord LIMIT 1").get() as { id: number };
    const beforeReviews = fixture.sqlite.prepare("SELECT * FROM review_states ORDER BY character_id, track").all();
    const session = await startSession(fixture.env.DB, { mode: "lesson", tracks: ["kr"], limit: 8, unitId: unit.id, testOut: true }, `recovered-${mistakes}`);
    const answers = recoveredUnitTestAnswers(session, mistakes);
    const response = await routeApiRequest(new Request(`https://test/api/curriculum/units/${unit.id}/test-out`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: session.sessionId, answers }),
    }), fixture.env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ passed: true, correct: session.cards.length, total: session.cards.length + mistakes, required: session.cards.length, mistakes });
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM curriculum_unit_completion_members WHERE unit_id = ?").get(unit.id)).toEqual({ count: session.cards.length / 2 });
    expect(fixture.sqlite.prepare("SELECT * FROM review_states ORDER BY character_id, track").all()).toEqual(beforeReviews);
  });

  it.each([1, 2, 3, 4])("returns a clean session response for a %i-character track", async (count) => {
    const fixture = setup(); databases.push(fixture.sqlite);
    fixture.sqlite.prepare(`DELETE FROM character_tracks WHERE track = 'kr' AND character_id NOT IN (SELECT character_id FROM character_tracks WHERE track = 'kr' ORDER BY character_id LIMIT ?)` ).run(count);
    const response = await routeApiRequest(new Request("https://test/api/session/start", {
      method: "POST",
      body: JSON.stringify({ mode: "lesson", tracks: ["kr"], limit: 8 }),
    }), fixture.env);
    const session = await response.json() as StartSessionResponse;

    expect(response.status).toBe(200);
    expect(session.cards).toHaveLength(count < 4 ? 0 : count);
    expect(session.shortage?.code).toBe(count < 4 ? "insufficient_content" : undefined);
    expect(session.shortage?.tracks).toEqual(count < 4 ? ["kr"] : undefined);
  });

  it("varies distractor sets between session seeds", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    fixture.sqlite.exec(emitSeedSql(parseSeed(JSON.parse(readFileSync("data/characters/cn-hsk1.json", "utf8")) as unknown)));
    const input = { mode: "lesson" as const, tracks: ["cn" as const], limit: 50 };
    const first = await startSession(fixture.env.DB, input, "session-a");
    const second = await startSession(fixture.env.DB, input, "session-b");
    const secondByKey = new Map(second.cards.filter((card) => card.kind === "reading").map((card) => [card.characterKey, card]));

    expect(first.cards.some((card) => {
      const other = secondByKey.get(card.characterKey);
      if (card.kind !== "reading" || !other || other.kind !== "reading") return false;
      const wrong = card.options.filter((_, index) => index !== card.answerIndex).map((option) => option.label).sort();
      const otherWrong = other.options.filter((_, index) => index !== other.answerIndex).map((option) => option.label).sort();
      return wrong.join() !== otherWrong.join();
    })).toBe(true);
  });

  it("issues sourced word cards only after all members are known", async () => {
    const fixture = setupSeeds(KR_THROUGH_4_FILES); databases.push(fixture.sqlite);
    fixture.sqlite.exec(emitWordSeedSql(parseWordSeed(JSON.parse(readFileSync("data/words/kr-wiktionary.json", "utf8")) as unknown)));
    const members = fixture.sqlite.prepare("SELECT id FROM characters WHERE key IN ('學', '校') ORDER BY id").all() as Array<{ id: number }>;
    const others = fixture.sqlite.prepare("SELECT id FROM characters WHERE key NOT IN ('學', '校') ORDER BY id LIMIT 3").all() as Array<{ id: number }>;
    const insert = fixture.sqlite.prepare("INSERT INTO review_states VALUES (?, 'kr', 2, 5, 1, 2, 0, 2, 0, 2, 1, 0, 1, 1)");
    insert.run(members[0].id);
    for (const other of others) insert.run(other.id);
    let session = await startSession(fixture.env.DB, { mode: "review", tracks: ["kr"], limit: 4 }, "one-known");
    expect(session.cards.every((card) => card.kind !== "word")).toBe(true);

    insert.run(members[1].id);
    session = await startSession(fixture.env.DB, { mode: "review", tracks: ["kr"], limit: 4 }, "both-known");
    const word = session.cards.find((card) => card.kind === "word");
    expect(session.cards.filter((card) => card.kind !== "word")).toHaveLength(4);
    expect(word).toMatchObject({ kind: "word", wordId: expect.any(Number), glyph: "學校", memberKeys: ["學", "校"], options: expect.any(Array), wordSourceUrl: expect.stringContaining("oldid=4219407") });
    expect(word?.options).toHaveLength(4);
    expect(new Set(word?.options.map((option) => option.label)).size).toBe(4);
  });

  it("rejects invalid tracks, limits, and malformed bodies as JSON 400s", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    expect((await routeApiRequest(new Request("https://test/api/curriculum?track=xx"), fixture.env)).status).toBe(400);
    for (const body of [{ mode: "lesson", tracks: ["xx"] }, { mode: "lesson", tracks: ["kr"], limit: -1 }, { mode: "lesson", tracks: ["kr"], limit: 51 }, { mode: "lesson", tracks: ["kr"], unitId: 1, levelOrd: 1 }]) {
      const response = await routeApiRequest(new Request("https://test/api/session/start", { method: "POST", body: JSON.stringify(body) }), fixture.env);
      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("application/json");
    }
    const malformed = await routeApiRequest(new Request("https://test/api/session/start", { method: "POST", body: "{" }), fixture.env);
    expect(malformed.status).toBe(400);
  });

  it("orders every track by level and curriculum independent of seed order", async () => {
    const forward = setupSeeds(CHARACTER_FILES); databases.push(forward.sqlite);
    const reverse = setupSeeds([...CHARACTER_FILES].reverse()); databases.push(reverse.sqlite);

    for (const track of ["kr", "jp", "cn"] as const) {
      const expected = expectedOrder(track);
      expect((await listForTracks(forward.env.DB, [track])).map((entry) => entry.key)).toEqual(expected);
      expect((await listForTracks(reverse.env.DB, [track])).map((entry) => entry.key)).toEqual(expected);
    }
    expect(expectedOrder("kr").slice(0, 50)).toEqual(parseSeed(JSON.parse(readFileSync("data/characters/kr-8geup.json", "utf8")) as unknown).curriculumUnits!.flatMap((unit) => unit.members.map((member) => member.key)));
  });

  it("orders all 1000 Korean curriculum members from 8급 through 4급", async () => {
    const fixture = setupSeeds(KR_THROUGH_4_FILES); databases.push(fixture.sqlite);
    const curriculum = await (await routeApiRequest(new Request("https://test/api/curriculum?track=kr"), fixture.env)).json() as CurriculumResponse;
    const levelWalk = curriculum.units.map((unit) => unit.level).filter((level, index, levels) => index === 0 || level !== levels[index - 1]);

    expect(levelWalk).toEqual(["8급", "7급", "6급II", "6급", "5급II", "5급", "4급II", "4급"]);
    expect(curriculum.units.flatMap((unit) => unit.nodes)).toHaveLength(1000);
    expect(curriculum.units.every((unit) => unit.nodes.length >= 8 && unit.nodes.length <= 10)).toBe(true);
  });

  it("orders Chinese units by their own HSK level and ordinal", async () => {
    const fixture = setupSeeds(["data/characters/cn-hsk3.json", "data/characters/cn-hsk1.json", "data/characters/cn-hsk2.json"]); databases.push(fixture.sqlite);
    fixture.sqlite.prepare("INSERT INTO placement_results (track, level_ord, level_badge, accuracy, detail, taken_at) VALUES ('cn', 2, 'HSK 2', 80, '', 1)").run();
    const curriculum = await (await routeApiRequest(new Request("https://test/api/curriculum?track=cn"), fixture.env)).json() as CurriculumResponse;
    const order = curriculum.units.map((unit) => [levelOrdFor("cn", unit.level), unit.ord]);

    expect(order).toEqual([...order].sort(([leftLevel, leftOrd], [rightLevel, rightOrd]) => leftLevel - rightLevel || leftOrd - rightOrd));
    expect(curriculum.units.filter((unit) => unit.level === "HSK 1").map((unit) => unit.ord)).toEqual(Array.from({ length: 25 }, (_, index) => index + 1));
    expect(curriculum.units.filter((unit) => unit.level === "HSK 2").map((unit) => unit.ord)).toEqual(Array.from({ length: 22 }, (_, index) => index + 1));
    expect(curriculum.units.filter((unit) => unit.level === "HSK 3").map((unit) => unit.ord)).toEqual(Array.from({ length: 29 }, (_, index) => index + 1));
    expect(curriculum.units.find((unit) => unit.current)).toMatchObject({ level: "HSK 2", ord: 1 });
    const lesson = await startSession(fixture.env.DB, { mode: "lesson", tracks: ["cn"], limit: 4, unitId: curriculum.units.find((unit) => unit.level === "HSK 2")!.id }, "cn-hsk2-anchor");
    expect(lesson.cards).toHaveLength(4);
    expect(lesson.cards.every((card) => card.levelOrd >= 2)).toBe(true);
  });

  it.each(["kr", "jp"] as const)("preserves %s unit ordering", async (track) => {
    const files = track === "kr" ? KR_THROUGH_4_FILES : CHARACTER_FILES.filter((path) => path.includes("/jp-"));
    const fixture = setupSeeds(files); databases.push(fixture.sqlite);
    const legacy = fixture.sqlite.prepare(`
      SELECT cu.id
      FROM curriculum_units cu
      JOIN curriculum_unit_members cum ON cum.unit_id = cu.id
      JOIN character_tracks ct ON ct.character_id = cum.character_id AND ct.track = cu.track
      WHERE cu.track = ?
      GROUP BY cu.id
      ORDER BY MIN(ct.level_ord), cu.ord
    `).all(track) as Array<{ id: number }>;
    const curriculum = await (await routeApiRequest(new Request(`https://test/api/curriculum?track=${track}`), fixture.env)).json() as CurriculumResponse;

    expect(curriculum.units.map((unit) => unit.id)).toEqual(legacy.map((unit) => unit.id));
  });

  it("starts fresh lessons at placement levels and requested units", async () => {
    const fixture = setupSeeds(CHARACTER_FILES); databases.push(fixture.sqlite);
    const post = (body: unknown) => routeApiRequest(new Request("https://test/api/session/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), fixture.env);
    const placement = await (await post({ mode: "placement", tracks: ["kr", "jp", "cn"], limit: 15 })).json() as StartSessionResponse;
    expect(placement.cards.map((card) => card.track)).toEqual(Array.from({ length: 15 }, (_, index) => (["kr", "jp", "cn"] as const)[index % 3]));
    expect([...new Set(placement.cards.filter((card) => card.track === "kr").map((card) => card.levelOrd))].sort()).toEqual([1, 2, 3]);
    expect([...new Set(placement.cards.filter((card) => card.track === "jp").map((card) => card.levelOrd))].sort()).toEqual([1, 3, 5]);
    expect([...new Set(placement.cards.filter((card) => card.track === "cn").map((card) => card.levelOrd))].sort()).toEqual([1, 2]);
    const unmappedKanken = new Set((fixture.sqlite.prepare("SELECT c.key FROM characters c JOIN character_tracks ct ON ct.character_id = c.id WHERE ct.track = 'jp' AND ct.jp_kanken = '未指定'").all() as Array<{ key: string }>).map((row) => row.key));
    expect(placement.cards.some((card) => unmappedKanken.has(card.characterKey))).toBe(true);
    expect(JSON.stringify(placement.cards)).not.toContain("未指定");

    fixture.sqlite.prepare("INSERT INTO placement_results (track, level_ord, level_badge, accuracy, detail, taken_at) VALUES ('kr', 2, '7급II', 90, '', 1)").run();
    const placed = await (await post({ mode: "lesson", tracks: ["kr"], limit: 4 })).json() as StartSessionResponse;
    expect(placed.cards[0].levelOrd).toBe(2);

    const unit = fixture.sqlite.prepare("SELECT cu.id, c.key FROM curriculum_units cu JOIN curriculum_unit_members cum ON cum.unit_id = cu.id JOIN characters c ON c.id = cum.character_id WHERE cu.track = 'kr' AND cu.level = '8급' AND cu.ord = 3 ORDER BY cum.ord LIMIT 1").get() as { id: number; key: string };
    const anchored = await (await post({ mode: "lesson", tracks: ["kr"], limit: 4, unitId: unit.id })).json() as StartSessionResponse;
    expect(anchored.cards[0].characterKey).toBe(unit.key);
  });

  it("keeps legacy non-curriculum rows out of placement questions", async () => {
    const fixture = setupSeeds(CHARACTER_FILES); databases.push(fixture.sqlite);
    fixture.sqlite.exec(`
      INSERT INTO characters (key, meaning_en, meaning_ko, variants, stroke_count) VALUES ('㐂', 'joy', '기쁠', '{"jp":"㐂"}', 6);
      INSERT INTO character_tracks (character_id, track, glyph, jp_on, jp_kun, jp_kanken, jp_jlpt, level_ord)
      SELECT id, 'jp', '㐂', 'キ', 'よろこ-ぶ', '未指定', 'N1', 9 FROM characters WHERE key = '㐂';
    `);
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM character_tracks WHERE track = 'jp' AND level_ord = 9").get()).toEqual({ count: 1 });
    expect((await listForTracks(fixture.env.DB, ["jp"])).some((character) => character.key === "㐂")).toBe(true);

    const placement = await startSession(fixture.env.DB, { mode: "placement", tracks: ["jp"], limit: 15 }, "legacy-placement");

    expect(placement.cards).toHaveLength(15);
    expect(placement.cards.some((card) => card.characterKey === "㐂")).toBe(false);
    expect([...new Set(placement.cards.map((card) => card.levelOrd))].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("reports Kanken coverage as secondary metadata for JP only", async () => {
    const fixture = setupSeeds(CHARACTER_FILES); databases.push(fixture.sqlite);
    const load = async () => await (await routeApiRequest(new Request("https://test/api/stats"), fixture.env)).json() as StatsResponse;
    const initial = await load();
    expect(initial.tracks.find((track) => track.track === "jp")?.secondaryScale).toMatchObject({ name: "漢検", level: "開始前", known: 0, nextLevel: "10級" });
    expect(initial.tracks.filter((track) => track.track !== "jp").every((track) => track.secondaryScale === undefined)).toBe(true);

    const gradeOne = fixture.sqlite.prepare("SELECT character_id FROM character_tracks WHERE track = 'jp' AND jp_kanken = '10級'").all() as Array<{ character_id: number }>;
    const insert = fixture.sqlite.prepare("INSERT INTO review_states (character_id, track, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, due, correct_count, total_count) VALUES (?, 'jp', 7, 5, 1, 2, 0, 2, 0, 2, 1, 1, 2, 2)");
    for (const row of gradeOne.slice(0, Math.ceil(gradeOne.length * 0.8))) insert.run(row.character_id);

    expect((await load()).tracks.find((track) => track.track === "jp")?.secondaryScale).toMatchObject({ name: "漢検", level: "10級", known: 0, nextLevel: "9級" });
  });

  it("keeps every Japanese API payload canonical when display setting is hiragana", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    fixture.sqlite.exec("UPDATE profile SET onyomi_script = 'hiragana'");
    const canonical = new Set((fixture.sqlite.prepare("SELECT jp_on FROM character_tracks WHERE track = 'jp'").all() as Array<{ jp_on: string }>).map((row) => row.jp_on));

    const curriculum = await (await routeApiRequest(new Request("https://test/api/curriculum?track=jp"), fixture.env)).json() as CurriculumResponse;
    expect(curriculum.units.flatMap((unit) => unit.nodes).every((node) => canonical.has(node.reading))).toBe(true);

    const key = curriculum.units[0].nodes[0].key;
    const stored = fixture.sqlite.prepare("SELECT ct.character_id, ct.jp_on FROM character_tracks ct JOIN characters c ON c.id = ct.character_id WHERE c.key = ? AND ct.track = 'jp'").get(key) as { character_id: number; jp_on: string };
    const detail = await (await routeApiRequest(new Request(`https://test/api/characters/${encodeURIComponent(key)}`), fixture.env)).json() as CharacterDetailResponse;
    expect(detail.tracks.find((track) => track.track === "jp")?.reading).toBe(`音 ${stored.jp_on}`);

    const lesson = await (await routeApiRequest(new Request("https://test/api/session/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "lesson", tracks: ["jp"], limit: 4 }) }), fixture.env)).json() as StartSessionResponse;
    expect(lesson.cards.filter((card) => card.kind === "reading").flatMap((card) => card.options).every((option) => canonical.has(option.label))).toBe(true);
    expect(lesson.cards.filter((card) => card.kind === "kun").flatMap((card) => card.options).every((option) => option.label !== "なし")).toBe(true);

    fixture.sqlite.prepare("INSERT INTO review_states VALUES (?, 'jp', 2, 5, 1, 2, 0, 2, 0, 2, 0, 0, 1, 1)").run(stored.character_id);
    const due = await (await routeApiRequest(new Request("https://test/api/reviews/due?tracks=jp&limit=1"), fixture.env)).json() as { cards: Array<{ reading: string }> };
    expect(due.cards[0].reading).toBe(stored.jp_on);
  });
});
