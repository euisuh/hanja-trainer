import type { SessionQueueItem } from "../../../shared/buildQueue";

export type IssuedQueueItem = {
  entry: SessionQueueItem;
  originalCardIndex: number;
  correction: boolean;
};

export function issuedQueue(queue: SessionQueueItem[]): IssuedQueueItem[] {
  return queue.map((entry, originalCardIndex) => ({ entry, originalCardIndex, correction: false }));
}

export function insertCorrection(queue: IssuedQueueItem[], currentIndex: number): IssuedQueueItem[] {
  const missed = queue[currentIndex];
  if (!missed || missed.correction || missed.entry.kind === "compare") return queue;
  let insertAt = currentIndex + 1;
  let intervening = 0;
  // ponytail: three cards is a pacing heuristic; FSRS supplies inter-day spacing.
  while (insertAt < queue.length && intervening < 3) {
    const item = queue[insertAt];
    if (!item.correction && item.entry.kind !== "compare") intervening += 1;
    insertAt += 1;
  }
  return [...queue.slice(0, insertAt), { ...missed, correction: true }, ...queue.slice(insertAt)];
}
