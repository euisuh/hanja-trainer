import type { ConversationGrade } from "../../../shared/api";
import type { ConversationChunk } from "../../../shared/types";

export const SLOW_LISTEN_PLAYBACK_RATE = 0.85;

export function hearGrade(correct: boolean, replays: number): ConversationGrade {
  if (!correct) return "again";
  return replays >= 2 ? "hard" : "good";
}

export function intentChoices<T extends Pick<ConversationChunk, "id" | "koCue">>(card: T, chunks: readonly T[]): T[] {
  return [card, ...chunks.filter((chunk) => chunk.id !== card.id && chunk.koCue !== card.koCue)].slice(0, 4);
}
