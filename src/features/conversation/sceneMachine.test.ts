import { describe, expect, it } from "vitest";
import { createSceneState, sceneReducer } from "./sceneMachine";
import type { ConversationSceneTurn } from "../../../shared/types";

const turns: ConversationSceneTurn[] = [
  { sceneId: 1, ord: 1, speaker: "npc", chunkIds: [2] },
  { sceneId: 1, ord: 2, speaker: "learner", chunkIds: [1] },
];

describe("scene machine", () => {
  it("keeps tap answer self-graded", () => {
    const npc = sceneReducer(createSceneState(), { type: "start" }, turns);
    const learner = sceneReducer(npc, { type: "next" }, turns);
    const grading = sceneReducer(learner, { type: "answer", latencyMs: null }, turns);
    const revealed = sceneReducer(grading, { type: "grade", grade: "good" }, turns);
    expect(revealed.results).toEqual([{ chunkId: 1, grade: "good", hints: 0, latencyMs: null }]);
  });

  it("has no scene depth cap", () => {
    const longTurns = Array.from({ length: 20 }, (_, index) => ({ sceneId: 1, ord: index + 1, speaker: "npc" as const, chunkIds: [2] }));
    let state = sceneReducer(createSceneState(), { type: "start" }, longTurns);
    for (let index = 1; index < longTurns.length; index += 1) state = sceneReducer(state, { type: "next" }, longTurns);
    expect(state.phase).toBe("npc");
    expect(state.turnIndex).toBe(19);
  });
});
