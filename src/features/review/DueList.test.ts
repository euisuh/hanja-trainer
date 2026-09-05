import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { initialState } from "../../shared/fsrs";
import type { CharacterEntry } from "../../shared/types";
import { reviewKey } from "../../shared/buildQueue";
import { buildDueItems } from "./DueList";
import { DueRow } from "./DueRow";

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

  it("keeps overdue and stability as separate row semantics", () => {
    const now = new Date("2026-01-10T00:00:00Z");
    const state = { ...initialState(now), due: new Date("2026-01-09T00:00:00Z"), stability: 2.25 };
    const [item] = buildDueItems(characters.slice(0, 1), new Map([[reviewKey(1, "kr"), state]]), ["kr"], now);
    const html = renderToStaticMarkup(createElement(DueRow, { item, buttonRef: null, onKeyDown: vi.fn(), onOpen: vi.fn(), onyomiScript: "katakana" }));

    expect(html).toContain('class="due-row__due due-row__due--overdue">1일 지남');
    expect(html).toContain('class="due-row__memory">S 2.3');
    expect(html).not.toMatch(/due-row__(?:overdue|stability)/u);
  });
});
