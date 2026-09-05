import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HighlightedSentence } from "./HighlightedSentence";

describe("HighlightedSentence", () => {
  it("highlights indexed glyphs and preserves the Korean badge", () => {
    expect(renderToStaticMarkup(<HighlightedSentence glyph="漢" targetIndex={2} text="日本漢字" />)).toBe("日本<mark>漢</mark>字");
    expect(renderToStaticMarkup(<HighlightedSentence glyph="漢" targetIndex={null} text="한자 문장" />)).toBe('<span class="sentence-target">한자 漢</span>한자 문장');
  });
});
