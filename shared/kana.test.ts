import { describe, expect, it } from "vitest";
import { toHiragana } from "./kana";

describe("toHiragana", () => {
  it.each([
    ["イチ・イツ", "いち・いつ"],
    ["キュウ・ク", "きゅう・く"],
    ["コー", "こー"],
    ["ヷヸヹヺ", "ヷヸヹヺ"],
    ["なし", "なし"],
    ["", ""],
    ["ひと-・ひと-つ", "ひと-・ひと-つ"],
  ])("converts only katakana with hiragana counterparts: %s", (input, expected) => {
    expect(toHiragana(input)).toBe(expected);
  });

  it("maps the complete U+30A1–U+30F6 range by -0x60", () => {
    const katakana = String.fromCodePoint(...Array.from({ length: 0x30f6 - 0x30a1 + 1 }, (_, index) => 0x30a1 + index));
    const hiragana = String.fromCodePoint(...Array.from({ length: 0x3096 - 0x3041 + 1 }, (_, index) => 0x3041 + index));
    expect(toHiragana(katakana)).toBe(hiragana);
  });

  it("is idempotent", () => {
    const converted = toHiragana("イチ・コー・ヷ・なし");
    expect(toHiragana(converted)).toBe(converted);
  });
});
