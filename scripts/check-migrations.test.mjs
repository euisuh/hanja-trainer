import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execPath } from "node:process";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";

const checker = fileURLToPath(new URL("./check-migrations.mjs", import.meta.url));

function git(directory, ...args) {
  return execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "hanja-migrations-"));
  await mkdir(join(directory, "migrations"));
  await writeFile(join(directory, "migrations/0023_existing.sql"), "SELECT 1;\n");
  git(directory, "init", "--quiet");
  git(directory, "config", "user.email", "test@example.com");
  git(directory, "config", "user.name", "Migration test");
  git(directory, "add", "migrations");
  git(directory, "commit", "--quiet", "-m", "base");
  return { directory, base: git(directory, "rev-parse", "HEAD") };
}

async function check(change) {
  const { directory, base } = await fixture();
  try {
    await change(directory);
    git(directory, "add", "--all");
    git(directory, "commit", "--quiet", "--allow-empty", "-m", "change");
    return spawnSync(execPath, [checker, base], { cwd: directory, encoding: "utf8" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("unchanged existing migration passes", async () => {
  const result = await check(async () => {});
  assert.equal(result.status, 0, result.stderr);
});

test("next migration number passes", async () => {
  const result = await check((directory) => writeFile(join(directory, "migrations/0024_added.sql"), "SELECT 2;\n"));
  assert.equal(result.status, 0, result.stderr);
});

test("edited existing migration fails", async () => {
  const result = await check((directory) => writeFile(join(directory, "migrations/0023_existing.sql"), "SELECT 2;\n"));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /0023_existing\.sql.*modified/u);
});

test("deleted existing migration fails", async () => {
  const result = await check((directory) => unlink(join(directory, "migrations/0023_existing.sql")));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /0023_existing\.sql.*deleted/u);
});

test("renamed existing migration fails", async () => {
  const result = await check((directory) => rename(
    join(directory, "migrations/0023_existing.sql"),
    join(directory, "migrations/0024_renamed.sql"),
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /0023_existing\.sql.*deleted/u);
});

test("duplicate numeric prefix fails", async () => {
  const result = await check((directory) => writeFile(join(directory, "migrations/0023_duplicate.sql"), "SELECT 2;\n"));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /duplicate migration number 0023/u);
});

test("lower new migration number fails", async () => {
  const result = await check((directory) => writeFile(join(directory, "migrations/0019_late.sql"), "SELECT 2;\n"));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /0019_late\.sql.*must be greater than 0023/u);
});

test("nested migration filename fails", async () => {
  const result = await check(async (directory) => {
    await mkdir(join(directory, "migrations/nested"));
    await writeFile(join(directory, "migrations/nested/0024_added.sql"), "SELECT 2;\n");
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /migration names must match migrations\/NNNN_name\.sql/u);
});
