// Runs oxlint (anti-slop rules) on files changed vs the default branch, plus untracked files.
import { execFileSync, spawnSync } from "node:child_process";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
const tryGit = (...args) => { try { return git(...args)[0]; } catch { return undefined; } };
const head = tryGit("symbolic-ref", "--short", "refs/remotes/origin/HEAD") ?? "main";
const base = tryGit("merge-base", "HEAD", head) ?? "HEAD";
const files = [...git("diff", "--relative", "--name-only", "--diff-filter=ACMR", base), ...git("ls-files", "-o", "--exclude-standard")]
  .filter((f) => /\.[cm]?[jt]sx?$/.test(f) && !f.startsWith("tools/oxlint/"));

if (files.length === 0) {
  console.log("lint:slop:changed — no changed JS/TS files");
  process.exit(0);
}

process.exit(spawnSync("npx", ["oxlint", "-c", "oxlint.config.ts", ...files], { stdio: "inherit", env: { ...process.env, NODE_NO_WARNINGS: "1" } }).status ?? 1);
