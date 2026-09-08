import { describe, expect, it } from "vitest";
import { parseReviewRequest } from "./review";

const valid = {
  sessionId: "session-a",
  cardIndex: 0,
  characterKey: "一",
  track: "kr",
  correct: true,
  skipped: false,
  elapsedMs: 500,
  mode: "review",
};

describe("parseReviewRequest", () => {
  it("validates every persisted review field", () => {
    expect(parseReviewRequest(valid)).toEqual(valid);
    expect(parseReviewRequest({ ...valid, track: "xx" })).toBeNull();
    expect(parseReviewRequest({ ...valid, skipped: true, correct: true })).toBeNull();
    expect(parseReviewRequest({ ...valid, elapsedMs: -1 })).toBeNull();
    expect(parseReviewRequest({ ...valid, mode: "unknown" })).toBeNull();
  });

  it("accepts real ISO offsets and rejects normalized calendar dates", () => {
    expect(parseReviewRequest({ ...valid, answeredAt: "2026-09-08T12:34:56.789+09:00" })).not.toBeNull();
    expect(parseReviewRequest({ ...valid, answeredAt: "2026-02-30T12:34:56.789Z" })).toBeNull();
    expect(parseReviewRequest({ ...valid, answeredAt: "not-a-date" })).toBeNull();
  });
});
