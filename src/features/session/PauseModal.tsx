import { useRef } from "react";
import { useFocusTrap } from "../../shared/useFocusTrap";

type Props = { onResume: () => void; onQuit: () => void };

export function PauseModal({ onResume, onQuit }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap({
    active: true,
    containerRef: panelRef,
    onKeyDown: (event) => {
      if (event.key === "Escape" || event.key === "Enter") {
        event.preventDefault();
        onResume();
      } else if (event.key.toLowerCase() === "q") {
        event.preventDefault();
        onQuit();
      }
    },
  });

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
