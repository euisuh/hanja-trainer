import type { ConversationGrade } from "../../../shared/api";
import type { ConversationSceneTurn } from "../../../shared/types";

export type ScenePhase = "intro" | "npc" | "learner" | "grading" | "reveal" | "complete";
export type SceneResult = { chunkId: number; grade: ConversationGrade; hints: number; latencyMs: number | null };
export type SceneState = {
  phase: ScenePhase;
  turnIndex: number;
  hints: number;
  npcTextVisible: boolean;
  results: readonly SceneResult[];
  pendingAnswer: { chunkId: number; latencyMs: number | null } | null;
  // Chunk id the NPC plays at each npc turn index; picked once per run so a variant's reply can be looked up.
  npcPlayed: Readonly<Record<number, number>>;
};
export type SceneAction =
  | { type: "start" }
  | { type: "hint" }
  | { type: "answer"; latencyMs: number | null }
  | { type: "grade"; grade: ConversationGrade }
  | { type: "next" };

function phaseFor(turn: ConversationSceneTurn | undefined): ScenePhase {
  return turn?.speaker ?? "complete";
}

export function createSceneState(npcPlayed: Readonly<Record<number, number>> = {}): SceneState {
  return { phase: "intro", turnIndex: 0, hints: 0, npcTextVisible: false, results: [], pendingAnswer: null, npcPlayed };
}

export type NpcLines = Record<number, number>;

export function pickNpcLines(turns: readonly ConversationSceneTurn[], random: () => number = Math.random): NpcLines {
  const played: NpcLines = {};
  turns.forEach((turn, index) => {
    if (turn.speaker === "npc" && turn.chunkIds.length > 0) played[index] = turn.chunkIds[Math.floor(random() * turn.chunkIds.length)];
  });
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- Turn indexes are the keys; a sparse index-to-chunk record is the intended contract.
  return played;
}

// The chunk the learner should say at turnIndex: the reply tied to the NPC variant just played, else the turn's first target.
export function expectedReplyId(turns: readonly ConversationSceneTurn[], turnIndex: number, npcPlayed: Readonly<Record<number, number>>): number | undefined {
  const previous = turns[turnIndex - 1];
  const played = npcPlayed[turnIndex - 1];
  const reply = previous?.variants?.find((variant) => variant.chunkId === played)?.replyChunkId;
  return reply ?? turns[turnIndex]?.chunkIds[0];
}

export function scenePassed(state: SceneState): boolean {
  return state.phase === "complete" && state.results.length > 0 && state.results.every(({ grade }) => grade !== "again");
}

export function sceneReducer(state: SceneState, action: SceneAction, turns: readonly ConversationSceneTurn[]): SceneState {
  if (state.phase === "complete") return state;
  if (action.type === "start" && state.phase === "intro") return { ...state, phase: phaseFor(turns[0]) };
  if (action.type === "hint" && (state.phase === "npc" || state.phase === "learner")) {
    return { ...state, hints: state.phase === "learner" ? state.hints + 1 : state.hints, npcTextVisible: !state.npcTextVisible };
  }
  if (action.type === "answer" && state.phase === "learner") {
    const chunkId = expectedReplyId(turns, state.turnIndex, state.npcPlayed);
    return chunkId ? { ...state, phase: "grading", pendingAnswer: { chunkId, latencyMs: action.latencyMs } } : state;
  }
  if (action.type === "grade" && state.phase === "grading" && state.pendingAnswer) {
    return {
      ...state,
      phase: "reveal",
      pendingAnswer: null,
      results: [...state.results, { ...state.pendingAnswer, hints: state.hints, grade: action.grade }],
    };
  }
  if (action.type === "next" && state.phase !== "intro" && state.phase !== "learner" && state.phase !== "grading") {
    const turnIndex = state.turnIndex + 1;
    return { ...state, phase: phaseFor(turns[turnIndex]), turnIndex, hints: 0, npcTextVisible: false };
  }
  return state;
}
