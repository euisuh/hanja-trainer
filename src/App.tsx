import { useEffect, useState, type CSSProperties } from "react";
import { matchPath, useLocation } from "react-router-dom";
import { cssVariables } from "./design/tokens";
import { AppRoutes, routes, type Screen } from "./routes";
import { AppHeader } from "./shell/AppHeader";
import { BottomNav } from "./shell/BottomNav";
import { useGlobalHotkeys } from "./shell/useGlobalHotkeys";
import { ApiClientError, PIN_REQUIRED_EVENT, apiClient } from "./lib/apiClient";
import { UnlockScreen } from "./screens/UnlockScreen";

const headerScreens = new Set<Screen>(["home", "review", "stats", "settings", "detail"]);
const navlessScreens = new Set<Screen>(["onboarding", "placement", "placement-result"]);
const sessionScreens = new Set<Screen>(["placement", "lesson", "review-session", "session-complete"]);

export function App() {
  const { pathname } = useLocation();
  const [pinGate, setPinGate] = useState<"checking" | "locked" | "unlocked">("checking");
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const screen = routes.find((route) => matchPath({ path: route.path, end: true }, pathname))?.screen ?? "onboarding";
  const sessionActive = sessionScreens.has(screen);

  useGlobalHotkeys({ sessionActive, modalOpen: pinGate !== "unlocked" });

  useEffect(() => {
    const controller = new AbortController();
    const requirePin = () => setPinGate("locked");
    window.addEventListener(PIN_REQUIRED_EVENT, requirePin);
    apiClient.pinState(controller.signal).then(async (state) => {
      setLockedUntil(state.lockedUntil);
      if (!state.enabled) { setPinGate("unlocked"); return; }
      try { await apiClient.profile(controller.signal); setPinGate("unlocked"); }
      catch (caught) { if (!controller.signal.aborted) setPinGate(caught instanceof ApiClientError && caught.code === "pin_required" ? "locked" : "checking"); }
    }).catch(() => { if (!controller.signal.aborted) setPinGate("checking"); });
    return () => { controller.abort(); window.removeEventListener(PIN_REQUIRED_EVENT, requirePin); };
  }, []);

  return (
    <div className="app" style={cssVariables as CSSProperties}>
      {pinGate === "checking" ? <main><p>잠금 상태 확인 중…</p></main> : pinGate === "locked" ? <UnlockScreen lockedUntil={lockedUntil} onUnlock={() => setPinGate("unlocked")} /> : <>
        {headerScreens.has(screen) && <AppHeader />}
        <main><AppRoutes /></main>
        {!navlessScreens.has(screen) && !sessionActive && <BottomNav />}
      </>}
    </div>
  );
}
