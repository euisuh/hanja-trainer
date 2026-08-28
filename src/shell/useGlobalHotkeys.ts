import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

type GlobalHotkeyOptions = {
  sessionActive: boolean;
  modalOpen: boolean;
};

const destinations: Record<string, string> = {
  h: "/home",
  r: "/review",
  t: "/stats",
  ",": "/settings",
};

export function useGlobalHotkeys({ sessionActive, modalOpen }: GlobalHotkeyOptions) {
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable)) return;
      if (modalOpen) return;
      if (sessionActive) return;

      const destination = destinations[event.key.toLowerCase()];
      if (!destination) return;

      event.preventDefault();
      navigate(destination);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen, navigate, sessionActive]);
}
