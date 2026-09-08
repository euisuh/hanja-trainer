/* global console, process */
import { execFileSync } from "node:child_process";

const migrationName = /^migrations\/(\d{4})_[^/]+\.sql$/u;

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function treeFiles(revision) {
  return git("ls-tree", "-r", "--name-only", "-z", revision, "--", "migrations")
    .split("\0")
    .filter((path) => path.endsWith(".sql"));
}

function migrationNumbers(paths, errors) {
  const numbers = new Map();
  for (const path of paths) {
    const match = migrationName.exec(path);
    if (!match) {
      errors.push(`${path}: migration names must match migrations/NNNN_name.sql`);
      continue;
    }
    const duplicate = numbers.get(match[1]);
    if (duplicate) errors.push(`duplicate migration number ${match[1]}: ${duplicate} and ${path}`);
    else numbers.set(match[1], path);
  }
  return numbers;
}

function checkMigrations(baseRevision) {
  if (!baseRevision) throw new Error("base Git revision required (argument or MIGRATION_BASE_SHA)");

  const base = git("rev-parse", "--verify", "--end-of-options", `${baseRevision}^{commit}`).trim();
  const baseFiles = treeFiles(base);
  const headFiles = treeFiles("HEAD");
  const errors = [];
  const baseNumbers = migrationNumbers(baseFiles, errors);
  const headNumbers = migrationNumbers(headFiles, errors);
  const baseSet = new Set(baseFiles);
  const status = { M: "modified", D: "deleted", T: "changed type" };
  const changes = git("diff", "--no-renames", "--name-status", "-z", base, "HEAD", "--", "migrations").split("\0");

  for (let index = 0; index + 1 < changes.length; index += 2) {
    const [change, path] = changes.slice(index, index + 2);
    if (path.endsWith(".sql") && baseSet.has(path) && change !== "A") {
      errors.push(`${path}: existing migration was ${status[change] ?? "changed"}; add a new migration instead`);
    }
  }

  const highestBase = Math.max(0, ...[...baseNumbers.keys()].map(Number));
  for (const [number, path] of headNumbers) {
    if (!baseSet.has(path) && Number(number) <= highestBase) {
      errors.push(`${path}: new migration number must be greater than ${String(highestBase).padStart(4, "0")}`);
    }
  }

  if (errors.length) throw new Error(errors.join("\n- "));
  return { base, highestBase, migrations: headFiles.length };
}

try {
  const result = checkMigrations(process.argv[2] ?? process.env.MIGRATION_BASE_SHA);
  console.log(`Migration check passed: ${result.migrations} files, base ${result.base.slice(0, 12)} through ${String(result.highestBase).padStart(4, "0")}.`);
} catch (error) {
  console.error(`Migration check failed:\n- ${error.message}`);
  process.exitCode = 1;
}
