/// <reference types="node" />

import { readdirSync, readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";

export function applyMigrations(sqlite: DatabaseSync): string[] {
  const names = readdirSync("migrations").filter((name) => name.endsWith(".sql")).sort();
  for (const name of names) sqlite.exec(readFileSync(`migrations/${name}`, "utf8"));
  return names;
}
