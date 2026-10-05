import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hanjaBridge } from "./hanjaBridge";

type ConversationFixture = { chunks: Array<{ text: string; cueKo: string }> };

// SAFETY: checked fixture shape supplies chunks with text and cueKo strings.
const fixture = JSON.parse(readFileSync("data/conversation/unit-05.json", "utf8")) as ConversationFixture;

describe("hanjaBridge", () => {
  it("preserves ten fixture lines while grouping Korean Hanja runs", () => {
    const lines = fixture.chunks.slice(0, 10).map(({ text }) => text);
    expect(lines).toHaveLength(10);
    for (const line of lines) expect(hanjaBridge(line).map((run) => run.text).join("")).toBe(line);
  });

  it("uses Korean readings for the reservation run", () => {
    const run = fixture.chunks.flatMap(({ text }) => hanjaBridge(text)).find(({ reading }) => reading === "예약");
    expect(run).toEqual({ text: "予約", reading: "예약" });
  });
});
