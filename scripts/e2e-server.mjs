/* global process */
import { spawn, spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { dirname, join } from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { URL, fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

export function parsePort(value) {
  if (!/^\d+$/.test(value)) throw new Error("E2E_PORT must be a numeric port");
  const port = Number(value);
  if (port < 1 || port > 65_535) throw new Error("E2E_PORT must be between 1 and 65535");
  return port;
}

function killTree(pid, signal) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

function npmInvocation(args) {
  return process.env.npm_execpath
    ? { command: process.execPath, args: [process.env.npm_execpath, ...args], shell: false }
    : { command: process.platform === "win32" ? "npm.cmd" : "npm", args, shell: process.platform === "win32" };
}

export function runServer() {
  const port = parsePort(process.env.E2E_PORT ?? "8787");
  const logPath = join(root, "test-results", "wrangler.log");
  mkdirSync(dirname(logPath), { recursive: true });
  const npm = npmInvocation(["run", "dev", "--", "--port", String(port)]);
  const log = openSync(logPath, "w");
  let child;
  try {
    child = spawn(npm.command, npm.args, {
      cwd: root,
      detached: process.platform !== "win32",
      env: { ...process.env, WRANGLER_LOG_PATH: join(root, "test-results", "wrangler-debug.log") },
      shell: npm.shell,
      stdio: ["ignore", log, log],
    });
  } finally {
    closeSync(log);
  }

  let stopping = false;
  let forceTimer;
  const signals = process.platform === "win32" ? ["SIGINT", "SIGTERM"] : ["SIGHUP", "SIGINT", "SIGTERM"];
  const listeners = new Map(signals.map((signal) => [signal, () => {
    if (stopping) return;
    stopping = true;
    killTree(child.pid, signal === "SIGHUP" ? "SIGTERM" : signal);
    forceTimer = setTimeout(() => killTree(child.pid, "SIGKILL"), 5_000);
    forceTimer.unref();
  }]));
  for (const [signal, listener] of listeners) process.once(signal, listener);

  child.once("error", (error) => process.stderr.write(`Wrangler could not start: ${error.message}\nLog: ${logPath}\n`));
  child.once("close", (code, signal) => {
    if (forceTimer) clearTimeout(forceTimer);
    for (const [name, listener] of listeners) process.removeListener(name, listener);
    if (!stopping && signal) process.stderr.write(`Wrangler exited from ${signal}. Log: ${logPath}\n`);
    process.exitCode = stopping ? 0 : code ?? 1;
  });

  return { child, logPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runServer();
