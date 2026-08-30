/* global process */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(args) {
  const result = spawnSync(npx, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(["wrangler", "d1", "migrations", "apply", "hanja", "--local"]);
run([
  "tsx", "scripts/seed.ts", "--local",
  ...readdirSync("data/characters").sort().map((name) => `data/characters/${name}`),
  ...readdirSync("data/sentences").sort().map((name) => `data/sentences/${name}`),
  ...readdirSync("data/words").filter((name) => name.endsWith(".json")).sort().map((name) => `data/words/${name}`),
]);
run(["wrangler", "d1", "execute", "hanja", "--local", "--file", "e2e/reset.sql"]);
