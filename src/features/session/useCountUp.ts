import { useEffect, useState } from "react";

/** Eases a number from 0 to `target` over `durationMs`, respecting reduced motion. */
export function useCountUp(target: number, durationMs = 700, delayMs = 400): number {
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  const [value, setValue] = useState(reducedMotion ? target : 0);

  useEffect(() => {
    if (typeof window === "undefined" || reducedMotion) return;
    let frame = 0;
    let start = 0;
    const step = (now: number) => {
      start ||= now;
      const elapsed = now - start - delayMs;
      if (elapsed < 0) {
        frame = requestAnimationFrame(step);
        return;
      }
      const progress = Math.min(1, elapsed / durationMs);
      setValue(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [delayMs, durationMs, reducedMotion, target]);

  return value;
}
