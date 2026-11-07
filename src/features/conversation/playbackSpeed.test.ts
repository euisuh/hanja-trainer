import { describe, expect, it } from "vitest";
import { allowedRates, nextRate, parseStoredRate } from "./playbackSpeed";

describe("Talk playback speed", () => {
  it("allows three rates", () => { expect(allowedRates).toEqual([0.75, 1, 1.25]); });
  it.each([[1, 1.25], [1.25, 0.75], [0.75, 1]] as const)("cycles %s to %s", (rate, next) => {
    expect(nextRate(rate)).toBe(next);
  });
  it.each([["2", 1], ["0.75", 0.75], [null, 1], ["1.25", 1.25], ["", 1]] as const)("parses %s as %s", (stored, rate) => {
    expect(parseStoredRate(stored)).toBe(rate);
  });
});
