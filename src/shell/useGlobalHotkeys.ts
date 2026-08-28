import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { GLOBAL_DESTINATIONS } from "./shortcuts";

type GlobalHotkeyOptions = {
  sessionActive: boolean;
  modalOpen: boolean;
};

export function useGlobalHotkeys({ sessionActive, modalOpen }: GlobalHotkeyOptions) {
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable)) return;
      if (modalOpen) return;
      if (sessionActive) return;

      const destination = GLOBAL_DESTINATIONS[event.key.toLowerCase()];
      if (!destination) return;

      event.preventDefault();
      navigate(destination);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen, navigate, sessionActive]);
}
