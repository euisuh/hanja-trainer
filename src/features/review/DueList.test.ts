import { describe, expect, it } from "vitest";
import { initialState } from "../../shared/fsrs";
import type { CharacterEntry } from "../../shared/types";
import { reviewKey } from "../session/buildQueue";
import { buildDueItems } from "./DueList";

const characters: CharacterEntry[] = [1, 2, 3].map((id) => ({
  id, key: `${id}`, meaningEn: "", meaningKo: "", variants: {}, strokeCount: 1, createdAt: 0, sentences: [],
  tracks: [{ characterId: id, track: "kr", glyph: `${id}`, reading: `읽기 ${id}`, level: "8급", levelOrd: 1 }],
}));

describe("buildDueItems", () => {
  it("keeps enabled due pairs only and sorts most overdue first", () => {
    const now = new Date("2026-01-10T00:00:00Z");
    const states = new Map([
      [reviewKey(1, "kr"), { ...initialState(now), due: new Date("2026-01-09T00:00:00Z") }],
      [reviewKey(2, "kr"), { ...initialState(now), due: new Date("2026-01-04T00:00:00Z") }],
      [reviewKey(3, "kr"), { ...initialState(now), due: new Date("2026-01-11T00:00:00Z") }],
    ]);
    const items = buildDueItems(characters, states, ["kr"], now);
    expect(items.map((item) => item.character.id)).toEqual([2, 1]);
    expect(items.map((item) => item.due.label)).toEqual(["6일 지남", "1일 지남"]);
  });
});
