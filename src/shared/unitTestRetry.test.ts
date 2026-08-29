import { describe, expect, it } from "vitest";
import { unitTestRetryOffset } from "./unitTestRetry";

describe("unitTestRetryOffset", () => {
  it("is deterministic for the complete retry context", () => {
    const input = { sessionId: "session-a", originalCardIndex: 4, mistakeNumber: 2, currentQueuePosition: 7, remainingLength: 9 };
    expect(unitTestRetryOffset(input)).toBe(unitTestRetryOffset(input));
  });

  it("inserts after an intervening card and stays within the pending queue", () => {
    for (let remainingLength = 1; remainingLength <= 12; remainingLength += 1) {
      const offset = unitTestRetryOffset({ sessionId: "session-b", originalCardIndex: 2, mistakeNumber: 1, currentQueuePosition: 3, remainingLength });
      expect(offset).toBeGreaterThanOrEqual(1);
      expect(offset).toBeLessThanOrEqual(remainingLength);
    }
  });

  it("uses the end position when no pending card can intervene", () => {
    expect(unitTestRetryOffset({ sessionId: "session-c", originalCardIndex: 0, mistakeNumber: 1, currentQueuePosition: 19, remainingLength: 0 })).toBe(0);
  });
});
