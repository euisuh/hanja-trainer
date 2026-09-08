import { useEffect } from "react";

type Options = {
  active: boolean;
  answered: boolean;
  compare: boolean;
  onPick: (index: number) => void;
  onSkip: () => void;
  onAdvance: () => void;
  onPause: () => void;
  recall?: "concealed" | "revealed" | "choices";
  onReveal?: () => void;
  onRecall?: (correct: boolean) => void;
};

export function useSessionKeys({ active, answered, compare, onPick, onSkip, onAdvance, onPause, recall, onReveal, onRecall }: Options) {
  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable=true]")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onPause();
      } else if ((event.key === "Enter" || event.key === " ") && recall === "concealed") {
        if (target instanceof HTMLElement && target.matches("button, a")) return;
        event.preventDefault();
        onReveal?.();
      } else if (/^[12]$/u.test(event.key) && recall === "revealed" && !answered) {
        event.preventDefault();
        onRecall?.(event.key === "2");
      } else if (/^[1-4]$/u.test(event.key) && !answered && !compare && (!recall || recall === "choices")) {
        event.preventDefault();
        onPick(Number(event.key) - 1);
      } else if (event.key === "5" && !answered && !compare && (!recall || recall === "choices")) {
        event.preventDefault();
        onSkip();
      } else if ((event.key === "Enter" || event.key === " ") && (answered || compare)) {
        if (target instanceof HTMLElement && target.matches("a, .feedback-bar button, .answer-option[aria-disabled=true], .skip-answer[aria-disabled=true]")) return;
        event.preventDefault();
        onAdvance();
      }
    }
    function onPointerUp(event: PointerEvent) {
      if (!(answered || compare)) return;
      const target = event.target;
      if (target instanceof Element && target.closest("a, button, input, textarea, select, [contenteditable=true]")) return;
      onAdvance();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [active, answered, compare, onAdvance, onPause, onPick, onRecall, onReveal, onSkip, recall]);
}
