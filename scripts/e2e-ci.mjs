/* global process */
import { readFileSync, renameSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { URL, fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const results = fileURLToPath(new URL("../test-results", import.meta.url));
export const wranglerFatalPrompt = "If you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose";
export const proxyWorkerFailure = "Error in ProxyController: Error inside ProxyWorker";
export const networkLost = "message: 'Network connection lost.'";

export function retryableWranglerCrash(log, debugLog = "") {
  return log.includes(wranglerFatalPrompt) && debugLog.includes(proxyWorkerFailure) && debugLog.includes(networkLost);
}

function runE2E() {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  return spawnSync(command, ["run", "e2e"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" }).status ?? 1;
}

export function main() {
  const status = runE2E();
  if (status === 0) return;
  let log = "";
  let debugLog = "";
  try { log = readFileSync(`${results}/wrangler.log`, "utf8"); } catch { /* A missing log is not retryable. */ }
  try { debugLog = readFileSync(`${results}/wrangler-debug.log`, "utf8"); } catch { /* A missing log is not retryable. */ }
  if (!retryableWranglerCrash(log, debugLog)) process.exitCode = status;
  else {
    renameSync(results, `${results}-wrangler-crash-first`);
    process.exitCode = runE2E();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
