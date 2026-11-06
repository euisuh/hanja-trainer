/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-unknown-returns -- Test fixtures read checked-in JSON seed files; the validator under test parses them. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseConversationSeed } from "../scripts/validate-conversation";
import { buildSlotDrillCard, slotDrillStateKey } from "./slotDrill";

const unit5 = parseConversationSeed(JSON.parse(readFileSync("data/conversation/unit-05.json", "utf8")) as unknown);
const template = unit5.templates?.[0];

describe("slot drill card", () => {
  it("emits a card from the unit 5 ___をください template", () => {
    if (!template) throw new Error("unit 5 template missing");
    const card = buildSlotDrillCard(template, () => 0);
    expect(card).toEqual({
      kind: "slot-drill",
      templateKey: "tpl-o-kudasai",
      stateKey: "tpl:tpl-o-kudasai",
      slotIndex: 0,
      cueKo: "커피 달라고 주문하기",
      ja: "コーヒーをください。",
      kana: "コーヒーをください。",
      options: template.slots,
    });
    expect(template.slots.length).toBeGreaterThanOrEqual(4);
    expect(template.slots.length).toBeLessThanOrEqual(6);
  });

  it("keys FSRS state per template, whatever slot comes up", () => {
    if (!template) throw new Error("unit 5 template missing");
    const keys = new Set(template.slots.map((_, index) => buildSlotDrillCard(template, () => (index + 0.5) / template.slots.length).stateKey));
    expect(keys).toEqual(new Set([slotDrillStateKey(template.key)]));
  });

  it("never repeats the previous slot", () => {
    if (!template) throw new Error("unit 5 template missing");
    for (const previous of template.slots.keys()) {
      for (const random of [0, 0.5, 0.999]) expect(buildSlotDrillCard(template, () => random, previous).slotIndex).not.toBe(previous);
    }
  });
});
