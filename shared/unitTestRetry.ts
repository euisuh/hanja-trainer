export type UnitTestRetryPosition = {
  sessionId: string;
  originalCardIndex: number;
  mistakeNumber: number;
  currentQueuePosition: number;
  remainingLength: number;
};

function hash(value: string): number {
  let result = 2_166_136_261;
  for (const point of value) result = Math.imul(result ^ point.codePointAt(0)!, 16_777_619);
  return result >>> 0;
}

/** Offset into the pending queue. A positive offset leaves pending cards between a miss and its retry. */
export function unitTestRetryOffset(input: UnitTestRetryPosition): number {
  if (input.remainingLength <= 0) return 0;
  const seed = `${input.sessionId}:${input.originalCardIndex}:${input.mistakeNumber}:${input.currentQueuePosition}:${input.remainingLength}`;
  return 1 + hash(seed) % input.remainingLength;
}
