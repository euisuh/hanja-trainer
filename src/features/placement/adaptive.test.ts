import { describe, expect, it } from "vitest";
import type { PlacementAnswer } from "../../shared/api";
import type { CharacterEntry, Track } from "../../shared/types";
import { createPlacementState, isPlacementComplete, nextPlacementItem, placementResults, recordPlacementAnswer, scorePlacementAnswers } from "./adaptive";

function characters(): CharacterEntry[] {
  return Array.from({ length: 5 }, (_, index) => {
    const id = index + 1;
    return {
      id, key: String(id), meaningEn: "", meaningKo: "", variants: {}, strokeCount: null, createdAt: 0, sentences: [],
      tracks: (["kr", "jp", "cn"] as Track[]).map((track) => track === "kr"
        ? { characterId: id, track, glyph: String(id), reading: `r${id}`, level: `${id}`, levelOrd: id }
        : track === "jp"
          ? { characterId: id, track, glyph: String(id), on: `o${id}`, kun: `k${id}`, kanken: `${id}`, jlpt: "N5", levelOrd: id }
          : { characterId: id, track, glyph: String(id), pinyin: `p${id}`, meaning: `${id}`, hsk: `${id}`, tier: "一", levelOrd: id }),
    };
  });
}

function run(answers: (index: number) => boolean) {
  const entries = characters();
  let state = createPlacementState(entries, ["kr"], 15);
  const recorded: PlacementAnswer[] = [];
  while (!isPlacementComplete(state)) {
    const item = nextPlacementItem(state, entries);
    if (!item) break;
    const correct = answers(state.total);
    recorded.push({ characterKey: item.character.key, track: item.track, correct, skipped: false, levelOrd: item.levelOrd });
    state = recordPlacementAnswer(state, item, correct);
  }
  return { state, result: placementResults(state)[0], answers: recorded };
}

describe("adaptive placement", () => {
  it("scores all-correct high, all-wrong at the floor, and mixed between", () => {
    const answers = (correct: boolean[]) => correct.map((value, index) => ({ characterKey: `${index}`, track: "kr" as const, correct: value, skipped: false, levelOrd: index + 1 }));
    const bounds = { kr: { minLevelOrd: 1, maxLevelOrd: 4 } };
    expect(scorePlacementAnswers(answers([true, true, true, true]), bounds)[0]).toMatchObject({ levelOrd: 4, saturated: true, floored: false });
    expect(scorePlacementAnswers(answers([true, true, true, true]), { kr: { minLevelOrd: 1, maxLevelOrd: 5 } })[0].saturated).toBe(false);
    expect(scorePlacementAnswers(answers([false, false, false, false]), bounds)[0]).toMatchObject({ levelOrd: 1, saturated: false, floored: true });
    expect(scorePlacementAnswers(answers([true, false, true, false]), bounds)[0].levelOrd).toBe(3);
  });

  it("uses the full budget and reports saturation when every answer is correct", () => {
    const { state, result } = run(() => true);
    expect(state.total).toBe(15);
    expect(state.estimates.kr).toMatchObject({ unchanged: 0, stable: false });
    expect(result).toMatchObject({ levelOrd: 5, saturated: true, floored: false });
  });

  it("keeps server scoring aligned after early misses recover to the ceiling", () => {
    const { answers, result } = run((index) => index >= 2);
    expect(result).toMatchObject({ levelOrd: 5, saturated: true, floored: false });
    expect(scorePlacementAnswers(answers, { kr: { minLevelOrd: 1, maxLevelOrd: 5 } })[0]).toMatchObject({
      levelOrd: 5,
      saturated: true,
      floored: false,
    });
  });

  it("uses the full budget and reports the floor when every answer is wrong", () => {
    const { state, result } = run(() => false);
    expect(state.total).toBe(15);
    expect(state.estimates.kr).toMatchObject({ unchanged: 0, stable: false });
    expect(result).toMatchObject({ levelOrd: 1, saturated: false, floored: true });
  });

  it("keeps genuine mid-range placement behavior unchanged", () => {
    const { result } = run((index) => index % 3 !== 2);
    expect(result.levelOrd).toBeGreaterThan(1);
    expect(result.levelOrd).toBeLessThan(5);
    expect(result).toMatchObject({ saturated: false, floored: false });
  });

  it("never exceeds the item budget", () => {
    const { state } = run(() => true);
    const item = nextPlacementItem(state, characters());
    expect(state.total).toBe(15);
    expect(item).toBeNull();
    expect(recordPlacementAnswer(state, { character: characters()[0], track: "kr", levelOrd: 1 }, true).total).toBe(15);
  });

  it("interleaves enabled tracks round-robin", () => {
    const entries = characters();
    let state = createPlacementState(entries, ["kr", "jp", "cn"]);
    const seen: Track[] = [];
    for (let index = 0; index < 6; index += 1) {
      const item = nextPlacementItem(state, entries)!;
      seen.push(item.track);
      state = recordPlacementAnswer(state, item, true);
    }
    expect(seen).toEqual(["kr", "jp", "cn", "kr", "jp", "cn"]);
  });

  it("reports saturation independently in a mixed multi-track run", () => {
    const entries = characters();
    let state = createPlacementState(entries, ["kr", "jp"]);
    while (!isPlacementComplete(state)) {
      const item = nextPlacementItem(state, entries)!;
      const correct = item.track === "kr" || state.estimates.jp.total % 2 === 0;
      state = recordPlacementAnswer(state, item, correct);
    }
    expect(placementResults(state)).toEqual([
      expect.objectContaining({ track: "kr", saturated: true, floored: false }),
      expect.objectContaining({ track: "jp", saturated: false, floored: false }),
    ]);
  });
});
