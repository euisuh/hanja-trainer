import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const dir = new URL("../data/characters/", import.meta.url);

function jpTracks(): Array<{ glyph: string; kun?: string }> {
  const out: Array<{ glyph: string; kun?: string }> = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const text = readFileSync(new URL(file, dir), "utf8");
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        if (o.track === "jp" && typeof o.glyph === "string") out.push(o as { glyph: string; kun?: string });
        Object.values(o).forEach(walk);
      }
    };
    walk(JSON.parse(text));
  }
  return out;
}

test("jp kun readings contain no katakana (unit-glyph import artifacts)", () => {
  const bad = jpTracks().filter((t) => t.kun && /\p{Script=Katakana}/u.test(t.kun));
  assert.deepEqual(bad.map((t) => `${t.glyph} ${t.kun}`), []);
});

test("留 kun has no bogus reading", () => {
  for (const t of jpTracks().filter((t) => t.glyph === "留")) assert.ok(!t.kun?.includes("るうぶる"));
});
