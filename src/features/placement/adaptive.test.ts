import { describe, expect, it } from "vitest";
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
  while (!isPlacementComplete(state)) {
    const item = nextPlacementItem(state, entries);
    if (!item) break;
    state = recordPlacementAnswer(state, item, answers(state.total));
  }
  return { state, result: placementResults(state)[0] };
}

describe("adaptive placement", () => {
  it("scores all-correct high, all-wrong at the floor, and mixed between", () => {
    const answers = (correct: boolean[]) => correct.map((value, index) => ({ characterKey: `${index}`, track: "kr" as const, correct: value, skipped: false, levelOrd: index + 1 }));
    expect(scorePlacementAnswers(answers([true, true, true, true]))[0].levelOrd).toBe(4);
    expect(scorePlacementAnswers(answers([false, false, false, false]))[0].levelOrd).toBe(1);
    expect(scorePlacementAnswers(answers([true, false, true, false]))[0].levelOrd).toBe(3);
  });
  it("converges upward when every answer is correct", () => {
    expect(run(() => true).result.levelOrd).toBe(5);
  });

  it("converges to the floor when every answer is wrong", () => {
    expect(run(() => false).result.levelOrd).toBe(1);
  });

  it("places mixed answers between floor and ceiling", () => {
    const { result } = run((index) => index % 3 !== 2);
    expect(result.levelOrd).toBeGreaterThan(1);
    expect(result.levelOrd).toBeLessThan(5);
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
});
