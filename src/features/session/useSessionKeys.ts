import { useEffect } from "react";

type Options = {
  active: boolean;
  answered: boolean;
  compare: boolean;
  onPick: (index: number) => void;
  onSkip: () => void;
  onAdvance: () => void;
  onPause: () => void;
};

export function useSessionKeys({ active, answered, compare, onPick, onSkip, onAdvance, onPause }: Options) {
  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable=true]")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onPause();
      } else if (/^[1-4]$/u.test(event.key) && !answered && !compare) {
        event.preventDefault();
        onPick(Number(event.key) - 1);
      } else if (event.key === "5" && !answered && !compare) {
        event.preventDefault();
        onSkip();
      } else if ((event.key === "Enter" || event.key === " ") && (answered || compare)) {
        if (target instanceof HTMLElement && target.matches("a, .feedback-bar button, .answer-option[aria-disabled=true], .skip-answer[aria-disabled=true]")) return;
        event.preventDefault();
        onAdvance();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, answered, compare, onAdvance, onPause, onPick, onSkip]);
}
