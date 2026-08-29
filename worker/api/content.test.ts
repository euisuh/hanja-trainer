import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { CharacterDetailResponse, CurriculumResponse, StartSessionResponse, StatsResponse } from "../../src/shared/api";
import { emitSeedSql, parseSeed } from "../../scripts/seed";
import type { Track } from "../../src/shared/types";
import { listForTracks } from "../db/characters";
import { startSession } from "./cards";
import { routeApiRequest } from "./router";

const CHARACTER_FILES = [
  "data/characters/cn-hsk1.json",
  "data/characters/cn-hsk2.json",
  "data/characters/jp-kanken-10.json",
  "data/characters/jp-kanken-9.json",
  "data/characters/kr-7geup.json",
  "data/characters/kr-8geup.json",
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
  sqlite.exec(readFileSync("migrations/0001_init.sql", "utf8"));
  sqlite.exec(readFileSync("migrations/0002_fsrs.sql", "utf8"));
  sqlite.exec(readFileSync("migrations/0003_sessions.sql", "utf8"));
  sqlite.exec(readFileSync("migrations/0004_profile.sql", "utf8"));
  sqlite.exec(readFileSync("migrations/0005_onyomi_script.sql", "utf8"));
  sqlite.exec(readFileSync("migrations/0006_skipped.sql", "utf8"));
  sqlite.exec(readFileSync("migrations/0007_pin.sql", "utf8"));
  sqlite.exec(emitSeedSql(parseSeed(JSON.parse(readFileSync("data/characters/kr-8geup.json", "utf8")) as unknown)));
  sqlite.exec(emitSeedSql(parseSeed(JSON.parse(readFileSync("data/characters/jp-kanken-10.json", "utf8")) as unknown)));
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
  sqlite.exec(readFileSync("migrations/0001_init.sql", "utf8"));
  sqlite.exec(readFileSync("migrations/0002_fsrs.sql", "utf8"));
  sqlite.exec(readFileSync("migrations/0003_sessions.sql", "utf8"));
  sqlite.exec(readFileSync("migrations/0004_profile.sql", "utf8"));
  sqlite.exec(readFileSync("migrations/0005_onyomi_script.sql", "utf8"));
  sqlite.exec(readFileSync("migrations/0006_skipped.sql", "utf8"));
  sqlite.exec(readFileSync("migrations/0007_pin.sql", "utf8"));
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
    expect(lesson.cards.every((card) => card.meaningKo.length > 0)).toBe(true);
    for (const card of lesson.cards.filter((item) => item.kind === "reading")) {
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

  it("starts fresh lessons at placement levels and requested units", async () => {
    const fixture = setupSeeds(CHARACTER_FILES); databases.push(fixture.sqlite);
    const post = (body: unknown) => routeApiRequest(new Request("https://test/api/session/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), fixture.env);
    fixture.sqlite.prepare("INSERT INTO placement_results (track, level_ord, level_badge, accuracy, detail, taken_at) VALUES ('kr', 2, '7급II', 90, '', 1)").run();
    const placed = await (await post({ mode: "lesson", tracks: ["kr"], limit: 4 })).json() as StartSessionResponse;
    expect(placed.cards[0].levelOrd).toBe(2);

    const unit = fixture.sqlite.prepare("SELECT cu.id, c.key FROM curriculum_units cu JOIN curriculum_unit_members cum ON cum.unit_id = cu.id JOIN characters c ON c.id = cum.character_id WHERE cu.track = 'kr' AND cu.level = '8급' AND cu.ord = 3 ORDER BY cum.ord LIMIT 1").get() as { id: number; key: string };
    const anchored = await (await post({ mode: "lesson", tracks: ["kr"], limit: 4, unitId: unit.id })).json() as StartSessionResponse;
    expect(anchored.cards[0].characterKey).toBe(unit.key);
  });

  it("reports JLPT kanji coverage from review mastery for JP only", async () => {
    const fixture = setupSeeds(CHARACTER_FILES); databases.push(fixture.sqlite);
    const load = async () => await (await routeApiRequest(new Request("https://test/api/stats"), fixture.env)).json() as StatsResponse;
    const initial = await load();
    expect(initial.tracks.find((track) => track.track === "jp")?.secondaryScale).toMatchObject({ name: "JLPT", level: "開始前", known: 0, nextLevel: "N5" });
    expect(initial.tracks.filter((track) => track.track !== "jp").every((track) => track.secondaryScale === undefined)).toBe(true);

    const n5 = fixture.sqlite.prepare("SELECT character_id FROM character_tracks WHERE track = 'jp' AND jp_jlpt = 'N5'").all() as Array<{ character_id: number }>;
    const insert = fixture.sqlite.prepare("INSERT INTO review_states (character_id, track, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, due, correct_count, total_count) VALUES (?, 'jp', 7, 5, 1, 2, 0, 2, 0, 2, 1, 1, 2, 2)");
    for (const row of n5.slice(0, Math.ceil(n5.length * 0.8))) insert.run(row.character_id);

    expect((await load()).tracks.find((track) => track.track === "jp")?.secondaryScale).toMatchObject({ name: "JLPT", level: "N5", known: 0, nextLevel: "N4" });
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
    expect(lesson.cards.flatMap((card) => card.options).every((option) => canonical.has(option.label))).toBe(true);

    fixture.sqlite.prepare("INSERT INTO review_states VALUES (?, 'jp', 2, 5, 1, 2, 0, 2, 0, 2, 0, 0, 1, 1)").run(stored.character_id);
    const due = await (await routeApiRequest(new Request("https://test/api/reviews/due?tracks=jp&limit=1"), fixture.env)).json() as { cards: Array<{ reading: string }> };
    expect(due.cards[0].reading).toBe(stored.jp_on);
  });
});
