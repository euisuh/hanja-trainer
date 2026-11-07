import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TalkRecap } from "./TalkRecap";

const chunks = Array.from({ length: 10 }, (_, id) => ({ id, ja: `日本語${id}`, kana: `よみ${id}`, koCue: `뜻${id}`, noteKo: id === 0 ? "사용 메모" : undefined }));
describe("Talk recap", () => {
  it("renders three practiced chunks with readings, cues and optional notes", () => {
    const html = renderToStaticMarkup(<TalkRecap chunks={chunks.slice(0, 3)} />);
    expect(html.match(/<li/g)).toHaveLength(3);
    for (const chunk of chunks.slice(0, 3)) {
      expect(html).toContain(chunk.ja);
      expect(html).toContain(chunk.kana);
      expect(html).toContain(chunk.koCue);
    }
    expect(html).toContain("사용 메모");
  });
  it("omits empty recap", () => { expect(renderToStaticMarkup(<TalkRecap chunks={[]} />)).toBe(""); });
  it("limits recap to eight chunks", () => {
    expect(renderToStaticMarkup(<TalkRecap chunks={chunks} />).match(/<li/g)).toHaveLength(8);
  });
});
