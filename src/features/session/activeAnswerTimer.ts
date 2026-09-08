export const MAX_ACTIVE_ANSWER_MS = 3_600_000;

export function createActiveAnswerTimer(now = () => performance.now()) {
  let activeMs = 0;
  let startedAt: number | null = null;

  function pause() {
    if (startedAt === null) return;
    activeMs += Math.max(0, now() - startedAt);
    startedAt = null;
  }

  return {
    pause,
    reset(running = true) {
      activeMs = 0;
      startedAt = running ? now() : null;
    },
    resume() {
      if (startedAt === null) startedAt = now();
    },
    snapshot() {
      pause();
      return Math.min(MAX_ACTIVE_ANSWER_MS, Math.max(0, Math.round(activeMs)));
    },
  };
}
