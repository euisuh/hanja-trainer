import { describe, expect, it } from "vitest";
import { scoreSpeech, speechHints, suggestGrade } from "./speechScore";

const target = ["コーヒーをください。", "こーひーをください"];

describe("scoreSpeech", () => {
  it("scores an exact match as 1 ignoring punctuation and katakana/hiragana", () => {
    const result = scoreSpeech("こーひーをください", target);
    expect(result.score).toBe(1);
    expect(result.ops).toEqual([{ type: "match", text: "こーひーをください" }]);
    expect(suggestGrade(result.score)).toBe("good");
  });

  it("flags a one-character substitution as one missing and one extra", () => {
    const result = scoreSpeech("ありがとうございます", ["ありがとうございます"]);
    expect(result.score).toBe(1);
    const off = scoreSpeech("ありがとうござます", ["ありがとうございます"]);
    expect(off.ops.filter((op) => op.type === "missing")).toEqual([{ type: "missing", text: "い" }]);
    const sub = scoreSpeech("ありがとうごさいます", ["ありがとうございます"]);
    expect(sub.ops.map((op) => op.type)).toContain("missing");
    expect(sub.ops.map((op) => op.type)).toContain("extra");
    expect(sub.score).toBeGreaterThan(0.85);
  });

  it("accepts a kana transcript for a kanji target through the reading", () => {
    expect(scoreSpeech("おみずをください", ["お水をください", "おみずをください"]).score).toBe(1);
  });

  it("names a missing particle in Korean", () => {
    const result = scoreSpeech("コーヒーください", target);
    expect(result.score).toBeLessThan(1);
    expect(speechHints(result).join(" ")).toContain("조사 'を'");
  });

  it("handles an empty transcript", () => {
    const result = scoreSpeech("  ", target);
    expect(result.score).toBe(0);
    expect(result.ops).toEqual([]);
    expect(suggestGrade(result.score)).toBe("again");
    expect(speechHints(result)[0]).toContain("인식되지 않았어요");
  });

  it("maps score thresholds to grades", () => {
    expect([0.95, 0.7, 0.3].map(suggestGrade)).toEqual(["good", "hard", "again"]);
  });
});
