// Serializes native storage writes so a slow set can never land after a later removal,
// while bounding each call so one hung bridge call cannot stall every later write.
// ponytail: a call that times out may still complete later, out of order; accepted because
// localStorage stays the primary copy and a stalled mirror would lose more.
export function createWriteQueue(timeoutMs = 5_000) {
  let tail: Promise<void> = Promise.resolve();
  return {
    enqueue(write: () => Promise<unknown>, warning: string) {
      tail = tail.then(() => new Promise<void>((resolve) => {
        const timer = setTimeout(() => { console.warn(`${warning} (timed out)`); resolve(); }, timeoutMs);
        let pending: Promise<unknown>;
        try { pending = write(); } catch (error) { pending = Promise.reject(error); }
        pending.catch(() => { console.warn(warning); }).finally(() => { clearTimeout(timer); resolve(); });
      }));
    },
    idle: () => tail,
  };
}
