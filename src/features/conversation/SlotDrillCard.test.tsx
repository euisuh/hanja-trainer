import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ConversationTemplatePayload } from "../../../shared/api";
import { SlotDrillCard } from "./SlotDrillCard";

const template: ConversationTemplatePayload = {
  id: 1, key: "tpl-o-kudasai", unitId: 5, ord: 1, jaTemplate: "___をください。", kanaTemplate: "___をください。", cueKo: "{slot} 달라고 주문하기",
  register: "polite", patternChunkId: 9,
  slots: [
    { ja: "コーヒー", kana: "コーヒー", meaningKo: "커피" }, { ja: "紅茶", kana: "こうちゃ", meaningKo: "홍차" },
    { ja: "お水", kana: "おみず", meaningKo: "물" }, { ja: "お茶", kana: "おちゃ", meaningKo: "차" },
  ],
};

describe("SlotDrillCard", () => {
  it("never shows the same noun twice in a row for one template", () => {
    let previous = "";
    for (let round = 0; round < 30; round += 1) {
      const cue = /talk-screen__cue">([^<]+)</.exec(renderToStaticMarkup(<SlotDrillCard onRate={() => undefined} template={template} />))?.[1] ?? "";
      expect(cue).not.toBe("");
      expect(cue).not.toBe(previous);
      previous = cue;
    }
  });

  it("shows the cue and slot options but hides the answer until reveal", () => {
    const markup = renderToStaticMarkup(<SlotDrillCard onRate={() => undefined} template={template} />);
    expect(markup).toContain("달라고 주문하기");
    expect(markup).toContain("コーヒー / 紅茶 / お水 / お茶");
    expect(markup).not.toContain("ください。</strong>");
    expect(markup).toContain("정답 공개");
  });
});
