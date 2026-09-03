import { useEffect, useRef, type RefObject } from "react";

type FocusTrapOptions = {
  active: boolean;
  containerRef: RefObject<HTMLElement | null>;
  /** Which element to listen on for Tab/keydown; defaults to window. */
  target?: "window" | "container";
  /** Focusable-controls selector within the container. Defaults to "button". */
  selector?: string;
  /** Element to focus once the trap activates; defaults to the first control. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Called for every keydown before the Tab-wrap logic runs -- use it for
   * modal-specific shortcuts (Escape, Enter, ...). Call event.preventDefault()
   * or event.stopPropagation() as needed; the trap doesn't require either. */
  onKeyDown?: (event: KeyboardEvent) => void;
  /** Called on cleanup to restore focus. Defaults to refocusing whatever had
   * focus before the trap activated. */
  restoreFocus?: () => void;
};

/** Traps Tab navigation within a container's focusable controls (wrapping at
 * the edges) while `active`, and restores focus on cleanup. Shared by
 * PauseModal and ProfileSettings' delete-confirmation dialog. */
export function useFocusTrap({ active, containerRef, target = "window", selector = "button", initialFocusRef, onKeyDown, restoreFocus }: FocusTrapOptions): void {
  // Kept current every render (via effect, not a render-time ref write) so the
  // effect below can stay mount/unmount-only (deps: [active]) without capturing
  // a stale onKeyDown/restoreFocus closure.
  const onKeyDownRef = useRef(onKeyDown);
  const restoreFocusRef = useRef(restoreFocus);
  useEffect(() => {
    onKeyDownRef.current = onKeyDown;
    restoreFocusRef.current = restoreFocus;
  });

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = container?.querySelectorAll<HTMLElement>(selector) ?? [];
    (initialFocusRef?.current ?? controls[0])?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      onKeyDownRef.current?.(event);
      if (event.key === "Tab" && controls.length > 0) {
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    const listenTarget: EventTarget | null = target === "window" ? window : container;
    listenTarget?.addEventListener("keydown", handleKeyDown as EventListener);
    return () => {
      listenTarget?.removeEventListener("keydown", handleKeyDown as EventListener);
      if (restoreFocusRef.current) restoreFocusRef.current();
      else previousFocus?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ref identities are stable; re-running per keystroke would refocus mid-interaction
  }, [active]);
}
