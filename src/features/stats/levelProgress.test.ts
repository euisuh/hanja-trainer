import { describe, expect, it } from "vitest";
import { progressFromKnown } from "./levelProgress";

const levels = [{ name: "A", count: 10 }, { name: "B", count: 20 }, { name: "C", count: 30 }];

describe("level progress", () => {
  it("handles zero known", () => expect(progressFromKnown(0, levels)).toMatchObject({ known: 0, pct: 0, currentLevel: "시작 전", nextLevel: "A" }));
  it("keeps the prior level while partially through the next", () => expect(progressFromKnown(15, levels)).toMatchObject({ currentLevel: "A", nextLevel: "B", pct: 25 }));
  it("advances exactly at a level boundary", () => expect(progressFromKnown(30, levels)).toMatchObject({ currentLevel: "B", nextLevel: "C", pct: 50 }));
  it("clamps beyond the top level", () => expect(progressFromKnown(99, levels)).toEqual({ known: 60, total: 60, pct: 100, currentLevel: "C", nextLevel: undefined }));
});
