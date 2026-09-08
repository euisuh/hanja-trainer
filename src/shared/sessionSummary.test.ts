import { describe, expect, it } from "vitest";
import { parseSessionRequest } from "./session";

const valid = { sessionId: "stable", mode: "review", startedAt: "2026-09-08T00:00:00.000Z", endedAt: "2026-09-08T00:01:00.000Z", answered: 2, correct: 1, skipped: 1, bestCombo: 1, xp: 10 };

describe("session summary validation", () => {
  it("accepts keyed and rollout-compatible unkeyed summaries", () => {
    expect(parseSessionRequest(valid)).toEqual(valid);
    expect(parseSessionRequest({ ...valid, sessionId: undefined })).toEqual({ ...valid, sessionId: undefined });
  });

  it.each([
    { ...valid, mode: "speaking" },
    { ...valid, sessionId: "" },
    { ...valid, startedAt: "invalid" },
    { ...valid, endedAt: "2026-09-07T00:00:00.000Z" },
    { ...valid, correct: 2, skipped: 1 },
    { ...valid, bestCombo: 3 },
    { ...valid, xp: -1 },
  ])("rejects malformed input", (input) => {
    expect(parseSessionRequest(input)).toBeNull();
  });
});
