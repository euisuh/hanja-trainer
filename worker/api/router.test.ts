import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../test/schema";
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

function request(path: string, method: "GET" | "HEAD" | "POST", headers?: HeadersInit) {
  return new Request(`https://test${path}`, { method, headers, body: method === "POST" ? "{}" : undefined });
}

describe("cross-site API writes", () => {
  const databases: DatabaseSync[] = [];
  afterEach(() => { for (const database of databases.splice(0)) database.close(); });

  it("rejects cross-site browser writes", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    for (const path of ["/api/reviews", "/api/reviews/batch"]) {
      const response = await routeApiRequest(request(path, "POST", { "sec-fetch-site": "cross-site" }), fixture.env);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: { code: "cross_site_request", message: "cross-site requests are not allowed" } });
    }
  });

  it("allows same-origin browser writes even when Origin disagrees", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const response = await routeApiRequest(request("/api/reviews", "POST", { origin: "https://evil.example", "sec-fetch-site": "same-origin" }), fixture.env);
    expect(response.status).not.toBe(403);
  });

  it("rejects cross-origin writes when Sec-Fetch-Site is absent", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const response = await routeApiRequest(request("/api/reviews", "POST", { origin: "https://evil.example" }), fixture.env);
    expect(response.status).toBe(403);
  });

  it("allows non-browser writes with neither origin header", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    const response = await routeApiRequest(request("/api/reviews", "POST"), fixture.env);
    expect(response.status).not.toBe(403);
  });

  it("allows cross-site reads", async () => {
    const fixture = setup(); databases.push(fixture.sqlite);
    expect((await routeApiRequest(request("/api/stats", "GET", { "sec-fetch-site": "cross-site" }), fixture.env)).status).not.toBe(403);
    expect((await routeApiRequest(request("/api/stats", "HEAD", { "sec-fetch-site": "cross-site" }), fixture.env)).status).not.toBe(403);
  });
});
