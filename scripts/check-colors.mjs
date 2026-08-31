/* global URL, console, process */
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = new URL("../src/", import.meta.url);
const tokenFile = "design/tokens.ts";
const color = /#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/giu;
const violations = [];
const tokenSource = await readFile(new URL(`../src/${tokenFile}`, import.meta.url), "utf8");

function namedColor(name) {
  const match = tokenSource.match(new RegExp(`\\b${name}:\\s*"(#[\\da-f]{6})"`, "iu"));
  if (!match) throw new Error(`Missing color token: ${name}`);
  return match[1];
}

function trackColor(track, name) {
  const match = tokenSource.match(new RegExp(`\\b${track}:\\s*\\{[^}]*\\b${name}:\\s*"(#[\\da-f]{6})"`, "iu"));
  if (!match) throw new Error(`Missing track color token: ${track}.${name}`);
  return match[1];
}

function luminance(hex) {
  const [red, green, blue] = hex.match(/[\da-f]{2}/giu).map((part) => {
    const channel = Number.parseInt(part, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground, background) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const contrastPairs = [
  ["lockedText/lockedBg", namedColor("lockedText"), namedColor("lockedBg")],
  ["lockedText/panel", namedColor("lockedText"), namedColor("panel")],
  ["faint/paper", namedColor("faint"), namedColor("paper")],
  ["faint/card", namedColor("faint"), namedColor("card")],
  ["jp.accentText/card", trackColor("jp", "accentText"), namedColor("card")],
  ["jp.accentText/soft", trackColor("jp", "accentText"), trackColor("jp", "soft")],
  ["cn.accentText/card", trackColor("cn", "accentText"), namedColor("card")],
  ["cn.accentText/soft", trackColor("cn", "accentText"), trackColor("cn", "soft")],
];

for (const [name, foreground, background] of contrastPairs) {
  const ratio = contrast(foreground, background);
  if (ratio < 4.5) violations.push(`${name}: ${ratio.toFixed(2)}:1 (minimum 4.5:1)`);
}

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if ([".css", ".ts", ".tsx"].includes(extname(path))) {
      const name = relative(root.pathname, path);
      if (name === tokenFile) continue;
      if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) continue;
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
  console.error(`Color checks failed:\n${violations.join("\n")}`);
  process.exitCode = 1;
}
