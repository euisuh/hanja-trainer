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

export function createSceneState(): SceneState {
  return { phase: "intro", turnIndex: 0, hints: 0, npcTextVisible: false, results: [], pendingAnswer: null };
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
    const chunkId = turns[state.turnIndex]?.chunkIds[0];
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
