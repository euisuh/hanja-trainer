/* global URL, console, process */
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = new URL("../src/", import.meta.url);
const tokenFile = "design/tokens.ts";
const color = /#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/giu;
const violations = [];

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if ([".css", ".ts", ".tsx"].includes(extname(path))) {
      const name = relative(root.pathname, path);
      if (name === tokenFile) continue;
      const lines = (await readFile(path, "utf8")).split("\n");
      lines.forEach((line, index) => {
        if (color.test(line)) violations.push(`${name}:${index + 1}: ${line.trim()}`);
        color.lastIndex = 0;
      });
    }
  }
}

await scan(root.pathname);
if (violations.length > 0) {
  console.error(`Hardcoded colors must live in ${tokenFile}:\n${violations.join("\n")}`);
  process.exitCode = 1;
}
