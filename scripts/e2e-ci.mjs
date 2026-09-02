/* global process */
import { readFileSync, renameSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { URL, fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const results = fileURLToPath(new URL("../test-results", import.meta.url));
export const brokenPipeSignature = "kj/async-io-unix.c++:186: disconnected: ::write(fd, buffer.begin(), buffer.size()): Broken pipe";

export function retryableWranglerCrash(log) {
  return log.includes(brokenPipeSignature);
}

function runE2E() {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  return spawnSync(command, ["run", "e2e"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" }).status ?? 1;
}

export function main() {
  const status = runE2E();
  if (status === 0) return;
  let log = "";
  try { log = readFileSync(`${results}/wrangler.log`, "utf8"); } catch { /* A missing log is not retryable. */ }
  if (!retryableWranglerCrash(log)) process.exitCode = status;
  else {
    renameSync(results, `${results}-wrangler-epipe-first`);
    process.exitCode = runE2E();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
