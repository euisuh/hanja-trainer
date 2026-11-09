import assert from "node:assert/strict";
import console from "node:console";
import process from "node:process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function withoutFences(text) {
  let fence;
  return text.split("\n").map((line) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker && !fence) { fence = marker; return ""; }
    if (fence) {
      if (marker?.[0] === fence[0] && marker.length >= fence.length && /^ {0,3}(`+|~+)\s*$/.test(line)) fence = undefined;
      return "";
    }
    return line;
  }).join("\n").replace(/<!--[^]*?-->/g, (comment) => comment.replace(/[^\n]/g, " "));
}

function headingSlugs(text) {
  const slugs = new Set();
  const lines = withoutFences(text).split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const atx = /^ {0,3}#{1,6}\s+(.+?)(?:\s+#+\s*)?$/.exec(lines[index]);
    const heading = atx?.[1] ?? (index + 1 < lines.length && /^ {0,3}(?:=+|-+)\s*$/.test(lines[index + 1]) ? lines[index].trim() : "");
    if (!heading) continue;
    const base = heading.replace(/<[^>]*>/g, "").replace(/!?\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "").replace(/ /g, "-");
    let slug = base;
    for (let suffix = 1; slugs.has(slug); suffix += 1) slug = `${base}-${suffix}`;
    slugs.add(slug);
  }
  return slugs;
}

function links(text) {
  const prose = withoutFences(text).replace(/(`+)[^\n]*?\1/g, (code) => " ".repeat(code.length));
  const found = [];
  const definitions = new Map();
  const referenceKey = (label) => label.trim().replace(/\s+/g, " ").toLowerCase();
  const add = (target, offset) => found.push({ target, line: prose.slice(0, offset).split("\n").length });
  for (const match of prose.matchAll(/^ {0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))/gm)) {
    definitions.set(referenceKey(match[1]), match[2] ?? match[3]);
    add(match[2] ?? match[3], match.index);
  }
  for (const match of prose.matchAll(/(?<!\\)\]\(/g)) {
    const end = match.index + 1;
    let cursor = end + 1;
    while (/\s/.test(prose[cursor] ?? "") && cursor < prose.length) cursor += 1;
    const start = cursor;
    if (prose[cursor] === "<") {
      const close = prose.indexOf(">", cursor);
      if (close !== -1) add(prose.slice(cursor + 1, close), match.index);
    } else {
      let depth = 0;
      while (cursor < prose.length) {
        const char = prose[cursor];
        if (char === "\\") { cursor += 2; continue; }
        if (char === "(") depth += 1;
        if (char === ")") { if (depth === 0) break; depth -= 1; }
        if (/\s/.test(char) && depth === 0) break;
        cursor += 1;
      }
      add(prose.slice(start, cursor).replace(/\\([()])/g, "$1"), match.index);
    }
  }
  for (const match of prose.matchAll(/!?\[([^\]\n]*)\](?:\[([^\]\n]*)\])?/g)) {
    const end = match.index + match[0].length;
    if (prose[end] !== ":" && prose[end] !== "(") {
      const key = referenceKey(match[2] || match[1]);
      if (definitions.has(key)) add(definitions.get(key), match.index);
      else if (match[2] !== undefined) add(`missing-reference:${key}`, match.index);
    }
  }
  for (const match of prose.matchAll(/<(?:img|a)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi)) add(match[1], match.index);
  return found;
}

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : entry.name.endsWith(".md") ? [path] : [];
  });
}

function check(root) {
  const failures = [];
  const files = [join(root, "README.md"), join(root, "CONTRIBUTING.md"), ...markdownFiles(join(root, "docs"))];
  for (const file of files) {
    for (const { target, line } of links(readFileSync(file, "utf8"))) {
      const fail = (reason) => failures.push(`${relative(root, file)}:${line}: ${target} — ${reason}`);
      if (target.startsWith("missing-reference:")) { fail("undefined reference"); continue; }
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) continue;
      try {
        const [rawPath, anchor] = target.split("#", 2);
        const path = decodeURIComponent(rawPath.split("?", 1)[0]);
        const destination = path ? path.startsWith("/") ? resolve(root, `.${path}`) : resolve(dirname(file), path) : file;
        if (!existsSync(destination)) { fail("path does not exist"); continue; }
        if (anchor && extname(destination).toLowerCase() === ".md" && !headingSlugs(readFileSync(destination, "utf8")).has(decodeURIComponent(anchor))) fail("heading anchor does not exist");
      } catch (error) { fail(error.message); }
    }
  }
  return failures;
}

function selfTest() {
  const root = mkdtempSync(join(tmpdir(), "docs-links-"));
  try {
    mkdirSync(join(root, "docs", "nested"), { recursive: true });
    writeFileSync(join(root, "README.md"), '# Root\n[ok](docs/nested/a.md#한글-heading)\n[duplicate](docs/nested/a.md#repeat-1)\n[ref][guide]\n[guide]: <docs/nested/a.md>\n![image](docs/image(1).png)\n<img src="docs/image(1).png">\n`[ignored](missing)`\n```md\n[ignored](missing)\n```\n');
    writeFileSync(join(root, "CONTRIBUTING.md"), "[Root](README.md#root)\n");
    writeFileSync(join(root, "docs", "nested", "a.md"), "# 한글 **Heading**\n## Repeat\n## Repeat\nSetext\n---\n[setext](#setext)\n");
    writeFileSync(join(root, "docs", "image(1).png"), "fixture");
    assert.deepEqual(check(root), []);
    writeFileSync(join(root, "CONTRIBUTING.md"), '[missing](absent.md)\n[anchor](README.md#absent)\n![missing](absent.png)\n[bad][undefined]\n[![nested](docs/image(1).png)](missing-outer.md)\n[encoded](docs/nested/a.md#%ED%95%9C%EA%B8%80-heading)\n');
    const failures = check(root);
    assert.equal(failures.length, 5);
    assert.ok(failures.some((failure) => /CONTRIBUTING.md:1: absent.md/.test(failure)));
    assert.ok(failures.some((failure) => /heading anchor/.test(failure)));
    assert.ok(failures.some((failure) => /missing-outer.md/.test(failure)));
    console.log("Documentation link checker self-test passed.");
  } finally { rmSync(root, { recursive: true, force: true }); }
}

if (process.argv.includes("--self-test")) selfTest();
else {
  const failures = check(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
  if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; }
  else console.log("Documentation links passed.");
}
