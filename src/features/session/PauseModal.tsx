import { useEffect, useRef } from "react";

type Props = { onResume: () => void; onQuit: () => void };

export function PauseModal({ onResume, onQuit }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = panel?.querySelectorAll<HTMLElement>("button") ?? [];
    controls[0]?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" || event.key === "Enter") {
        event.preventDefault();
        onResume();
      } else if (event.key.toLowerCase() === "q") {
        event.preventDefault();
        onQuit();
      } else if (event.key === "Tab" && controls.length > 0) {
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
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [onQuit, onResume]);

  return (
    <div className="pause-modal" role="presentation">
      <div aria-labelledby="pause-title" aria-modal="true" className="pause-modal__panel" ref={panelRef} role="dialog">
        <h2 id="pause-title">일시정지</h2>
        <p>지금 나가도 답한 카드의 FSRS 상태는 저장됩니다.</p>
        <button className="pause-modal__resume" onClick={onResume} type="button">계속하기 <kbd>ESC</kbd></button>
        <button onClick={onQuit} type="button">세션 종료 <kbd>Q</kbd></button>
      </div>
    </div>
  );
}
