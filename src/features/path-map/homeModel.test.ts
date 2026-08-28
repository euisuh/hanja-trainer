import { describe, expect, it } from "vitest";
import { initialState } from "../../shared/fsrs";
import type { CharacterEntry } from "../../shared/types";
import { reviewKey } from "../session/buildQueue";
import { buildPathNodes, MASTERY_STABILITY_DAYS, progressPercent } from "./homeModel";

function character(id: number): CharacterEntry {
  return {
    id, key: `${id}`, meaningEn: "", meaningKo: "", variants: {}, strokeCount: null, createdAt: 0, sentences: [],
    tracks: [{ characterId: id, track: "kr", glyph: `${id}`, reading: `읽기${id}`, level: "8급", levelOrd: 1 }],
  };
}

describe("home path model", () => {
  it("derives done, current, and locked nodes from FSRS stability", () => {
    const mastered = { ...initialState(new Date()), stability: MASTERY_STABILITY_DAYS };
    const nodes = buildPathNodes([character(1), character(2), character(3)], "kr", new Map([[reviewKey(1, "kr"), mastered]]));
    expect(nodes.map((node) => node.state)).toEqual(["done", "current", "locked"]);
    expect(nodes.map((node) => node.label)).toEqual(["읽기1", "읽기2", "잠김"]);
  });

  it("keeps progress finite for empty totals", () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(12, 10)).toBe(100);
  });
});
