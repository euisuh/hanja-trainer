import { describe, expect, it } from "vitest";
import { hearGrade, intentChoices } from "./listenCardModel";

describe("hearGrade", () => {
  it.each([
    [false, 0, "again"],
    [true, 0, "good"],
    [true, 1, "good"],
    [true, 2, "hard"],
  ] as const)("maps correct=%s replays=%s", (correct, replays, grade) => {
    expect(hearGrade(correct, replays)).toBe(grade);
  });
});

describe("intentChoices", () => {
  it("keeps target first with distinct cues", () => {
    const chunks = [{ id: 1, koCue: "one" }, { id: 2, koCue: "two" }, { id: 3, koCue: "three" }, { id: 4, koCue: "four" }];
    expect(intentChoices(chunks[2], chunks)).toEqual([chunks[2], chunks[0], chunks[1], chunks[3]]);
  });
});
