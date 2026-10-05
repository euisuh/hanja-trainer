import type { ConversationChunk, ConversationScene } from "./types";

export const DEFAULT_TALK_NEW_CHUNK_LIMIT = 8;
export const MAX_TALK_NEW_CHUNK_LIMIT = 10;

type TalkSessionChunk = Pick<ConversationChunk, "id" | "unitId" | "role">;
type TalkSessionScene = Pick<ConversationScene, "id" | "unitId">;

export type TalkSessionReviewUnit<TChunk extends TalkSessionChunk = TalkSessionChunk, TScene extends TalkSessionScene = TalkSessionScene> = {
  chunks: readonly TChunk[];
  scene: TScene;
};

export type TalkSessionInput<TChunk extends TalkSessionChunk = TalkSessionChunk, TScene extends TalkSessionScene = TalkSessionScene> = {
  dueChunks: readonly TChunk[];
  newChunks: readonly TChunk[];
  practiceScene: TScene;
  completedUnits: readonly TalkSessionReviewUnit<TChunk, TScene>[];
  newChunkLimit?: number;
};

export type TalkSessionItem<TChunk extends TalkSessionChunk = TalkSessionChunk, TScene extends TalkSessionScene = TalkSessionScene> =
  | { kind: "chunk"; phase: "hear" | "say" | "new"; chunk: TChunk }
  | { kind: "scene"; scene: TScene; review: boolean };

function chunkKey(chunk: TalkSessionChunk): string {
  return `${chunk.id}:${chunk.role}`;
}

function newChunkLimit(value: number | undefined): number {
  return Math.min(MAX_TALK_NEW_CHUNK_LIMIT, Math.max(0, Math.floor(value ?? DEFAULT_TALK_NEW_CHUNK_LIMIT)));
}

function reviewUnit<TChunk extends TalkSessionChunk, TScene extends TalkSessionScene>(units: readonly TalkSessionReviewUnit<TChunk, TScene>[], dueChunks: readonly TChunk[]): TalkSessionReviewUnit<TChunk, TScene> | undefined {
  const dueIds = new Set(dueChunks.map((chunk) => chunk.id));
  return units.find((unit) => unit.chunks.length > 0 && unit.chunks.filter((chunk) => dueIds.has(chunk.id)).length * 10 >= unit.chunks.length * 3);
}

export function composeTalkSession<TChunk extends TalkSessionChunk, TScene extends TalkSessionScene>(input: TalkSessionInput<TChunk, TScene>): TalkSessionItem<TChunk, TScene>[] {
  const due = new Set(input.dueChunks.map(chunkKey));
  const newChunks = input.newChunks.filter((chunk) => !due.has(chunkKey(chunk))).slice(0, newChunkLimit(input.newChunkLimit));
  const review = reviewUnit(input.completedUnits, input.dueChunks);
  return [
    ...input.dueChunks.filter((chunk) => chunk.role === "hear").map((chunk) => ({ kind: "chunk" as const, phase: "hear" as const, chunk })),
    ...input.dueChunks.filter((chunk) => chunk.role === "say").map((chunk) => ({ kind: "chunk" as const, phase: "say" as const, chunk })),
    ...newChunks.map((chunk) => ({ kind: "chunk" as const, phase: "new" as const, chunk })),
    { kind: "scene", scene: review?.scene ?? input.practiceScene, review: Boolean(review) },
  ];
}
