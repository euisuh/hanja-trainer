/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-runtime-typeof -- This test predates the changed-file lint; it adapts node:sqlite rows to the D1 interface. */
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { expect, test } from "vitest";
import { emitSeedSql, parseSeed } from "../../scripts/seed";
import type { Track } from "../../shared/types";
import { applyMigrations } from "../test/schema";
import { listForTracks, listFreshForTracks } from "./characters";

type Query = { sql: string; values: SQLInputValue[] };
type Results = { listed: number[]; fresh: Array<{ character_id: number; track: Track }> };

const INDEX = "idx_curriculum_unit_members_character";
const TRACK_SETS: Track[][] = [["kr"], ["jp"], ["cn"], ["kr", "jp", "cn"]];

function d1Result<T>(results: T[]): D1Result<T> {
  return { results, success: true, meta: { duration: 0, size_after: 0, rows_read: 0, rows_written: 0, last_row_id: 0, changed_db: false, changes: 0 } };
}

function d1(sqlite: DatabaseSync, queries: Query[]): D1Database {
  const adapter = Object.create(null) as D1Database;
  adapter.prepare = (sql: string) => {
    let values: SQLInputValue[] = [];
    const prepared = Object.create(null) as D1PreparedStatement;
    prepared.bind = (...bound: unknown[]) => {
      values = bound.map((value) => {
        if (typeof value === "string" || typeof value === "number" || typeof value === "bigint" || value === null) return value;
        throw new Error(`Unsupported test binding: ${String(value)}`);
      });
      return prepared;
    };
    prepared.all = async <T>() => {
      queries.push({ sql, values: [...values] });
      return d1Result(sqlite.prepare(sql).all(...values) as T[]);
    };
    return prepared;
  };
  return adapter;
}

// Parsed once: the three databases below get identical seed SQL.
const SEED_SQL = readdirSync("data/characters").filter((file) => file.endsWith(".json")).sort()
  .map((name) => emitSeedSql(parseSeed(JSON.parse(readFileSync(`data/characters/${name}`, "utf8")) as unknown)))
  .join("\n");

function setup(): DatabaseSync {
  const sqlite = new DatabaseSync(":memory:");
  applyMigrations(sqlite);
  sqlite.exec(SEED_SQL);
  return sqlite;
}

function hasCoveringLookup(sqlite: DatabaseSync, queries: Query[]): boolean {
  const columns = sqlite.prepare(`PRAGMA index_info(${INDEX})`).all().map((row) => row.name);
  if (columns.join(",") !== "character_id,unit_id,ord") return false;
  return queries.every(({ sql, values }) => (sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...values) as Array<{ detail: string }>)
    .some(({ detail }) => detail.includes(`SEARCH cum USING COVERING INDEX ${INDEX}`)
      && detail.includes("character_id=?") && detail.includes("unit_id=?")));
}

async function exercise(sqlite: DatabaseSync): Promise<{ queries: Query[]; results: Map<string, Results> }> {
  const queries: Query[] = [];
  const database = d1(sqlite, queries);
  const results = new Map<string, Results>();
  for (const tracks of TRACK_SETS) {
    const listed = await listForTracks(database, tracks);
    const fresh = await listFreshForTracks(database, 1, tracks, { levelOrd: 1 });
    const placeholders = tracks.map(() => "?").join(", ");
    const expectedIds = (sqlite.prepare(`SELECT DISTINCT character_id FROM character_tracks WHERE track IN (${placeholders})`).all(...tracks) as Array<{ character_id: number }>).map(({ character_id }) => character_id).sort((a, b) => a - b);
    const expectedFresh = (sqlite.prepare(`SELECT character_id, track FROM character_tracks WHERE track IN (${placeholders})`).all(...tracks) as Array<{ character_id: number; track: Track }>).map(({ character_id, track }) => `${character_id}:${track}`).sort();

    expect(listed.map(({ id }) => id).sort((a, b) => a - b)).toEqual(expectedIds);
    expect([...new Set(fresh.map(({ character_id, track }) => `${character_id}:${track}`))].sort()).toEqual(expectedFresh);
    results.set(tracks.join(","), { listed: listed.map(({ id }) => id), fresh });
  }
  return { queries, results };
}

test("curriculum lookups use the character-first covering index", async () => {
  const indexed = setup();
  const narrowed = setup();
  const dropped = setup();
  try {
    const baseline = await exercise(indexed);
    expect(baseline.queries).toHaveLength(TRACK_SETS.length * 2);
    expect(hasCoveringLookup(indexed, baseline.queries)).toBe(true);

    narrowed.exec(`DROP INDEX ${INDEX}; CREATE INDEX ${INDEX} ON curriculum_unit_members(character_id, unit_id)`);
    const narrowedRun = await exercise(narrowed);
    expect(narrowedRun.results).toEqual(baseline.results);
    expect(hasCoveringLookup(narrowed, narrowedRun.queries)).toBe(false);

    dropped.exec(`DROP INDEX ${INDEX}`);
    const droppedRun = await exercise(dropped);
    expect(droppedRun.results).toEqual(baseline.results);
    expect(hasCoveringLookup(dropped, droppedRun.queries)).toBe(false);
  } finally {
    indexed.close();
    narrowed.close();
    dropped.close();
  }
  // Three full seeds take ~7s on a loaded 2-vCPU CI runner; the 5s default timed out.
}, 30_000);
