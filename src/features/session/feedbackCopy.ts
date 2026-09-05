const CORRECT = ["정확해요", "좋아요", "훌륭해요", "완벽해요", "그거예요"] as const;
const STREAK = ["연속으로 잘하고 있어요", "흐름을 탔어요", "멈추지 마세요"] as const;
const WRONG = ["아쉬워요", "거의 맞았어요", "다음엔 잡을 수 있어요"] as const;

/** Deterministic per card index so re-renders don't reshuffle the wording. */
function pick<T>(list: readonly T[], seed: number): T {
  return list[Math.abs(seed) % list.length];
}

export function correctHeadline(cardIndex: number, combo: number): string {
  return combo >= 4 ? pick(STREAK, cardIndex) : pick(CORRECT, cardIndex);
}

export function wrongHeadline(cardIndex: number): string {
  return pick(WRONG, cardIndex);
}
