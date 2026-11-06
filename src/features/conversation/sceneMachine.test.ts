import { describe, expect, it } from "vitest";
import { createSceneState, expectedReplyId, pickNpcLines, sceneReducer } from "./sceneMachine";
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

  it("expects the reply tied to the NPC variant that was played", () => {
    const branching: ConversationSceneTurn[] = [
      { sceneId: 1, ord: 1, speaker: "npc", chunkIds: [10, 11], variants: [{ chunkId: 10, replyChunkId: 20 }, { chunkId: 11, replyChunkId: 21 }] },
      { sceneId: 1, ord: 2, speaker: "learner", chunkIds: [20, 21] },
    ];
    for (const [played, reply] of [[10, 20], [11, 21]]) {
      const npc = sceneReducer(createSceneState({ 0: played }), { type: "start" }, branching);
      const learner = sceneReducer(npc, { type: "next" }, branching);
      expect(expectedReplyId(branching, 1, { 0: played })).toBe(reply);
      const graded = sceneReducer(sceneReducer(learner, { type: "answer", latencyMs: null }, branching), { type: "grade", grade: "good" }, branching);
      expect(graded.results.map(({ chunkId }) => chunkId)).toEqual([reply]);
    }
  });

  it("picks every NPC variant over many runs and falls back to the first learner target without variants", () => {
    const branching: ConversationSceneTurn[] = [
      { sceneId: 1, ord: 1, speaker: "npc", chunkIds: [10, 11], variants: [{ chunkId: 10, replyChunkId: 20 }, { chunkId: 11, replyChunkId: 21 }] },
      { sceneId: 1, ord: 2, speaker: "learner", chunkIds: [20, 21] },
    ];
    expect(new Set([0, 0.99].map((value) => pickNpcLines(branching, () => value)[0]))).toEqual(new Set([10, 11]));
    expect(expectedReplyId(turns, 1, pickNpcLines(turns))).toBe(1);
  });

  it("has no scene depth cap", () => {
    const longTurns = Array.from({ length: 20 }, (_, index) => ({ sceneId: 1, ord: index + 1, speaker: "npc" as const, chunkIds: [2] }));
    let state = sceneReducer(createSceneState(), { type: "start" }, longTurns);
    for (let index = 1; index < longTurns.length; index += 1) state = sceneReducer(state, { type: "next" }, longTurns);
    expect(state.phase).toBe("npc");
    expect(state.turnIndex).toBe(19);
  });
});
