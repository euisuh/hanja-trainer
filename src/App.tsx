import { useEffect, useState, type CSSProperties } from "react";
import { matchPath, useLocation } from "react-router-dom";
import { themes } from "./design/tokens";
import { AppRoutes, routes, type Screen } from "./routes";
import { AppHeader } from "./shell/AppHeader";
import { BottomNav } from "./shell/BottomNav";
import { useGlobalHotkeys } from "./shell/useGlobalHotkeys";
import { ApiClientError, PIN_REQUIRED_EVENT, SETTINGS_UPDATED_EVENT, apiClient } from "./lib/apiClient";
import { UnlockScreen } from "./screens/UnlockScreen";
import type { SettingsResponse } from "./shared/api";
import type { ThemeId } from "./shared/settings";

const headerScreens = new Set<Screen>(["home", "review", "stats", "settings", "detail", "study"]);
const navlessScreens = new Set<Screen>(["onboarding", "placement", "placement-result"]);
const sessionScreens = new Set<Screen>(["placement", "lesson", "review-session", "session-complete", "speaking"]);

export function App() {
  const { pathname } = useLocation();
  const [pinGate, setPinGate] = useState<"checking" | "error" | "locked" | "unlocked">("checking");
  const [pinRetry, setPinRetry] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [theme, setTheme] = useState<ThemeId>("quiet-technical");
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
      catch (caught) { if (!controller.signal.aborted) setPinGate(caught instanceof ApiClientError && caught.code === "pin_required" ? "locked" : "error"); }
    }).catch(() => { if (!controller.signal.aborted) setPinGate("error"); });
    return () => { controller.abort(); window.removeEventListener(PIN_REQUIRED_EVENT, requirePin); };
  }, [pinRetry]);

  useEffect(() => {
    const controller = new AbortController();
    const updateTheme = (event: Event) => {
      const next = (event as CustomEvent<Partial<SettingsResponse>>).detail?.theme;
      if (next) setTheme(next);
    };
    window.addEventListener(SETTINGS_UPDATED_EVENT, updateTheme);
    if (pinGate === "unlocked") void apiClient.settings(controller.signal).then((settings) => setTheme(settings.theme)).catch(() => undefined);
    return () => { controller.abort(); window.removeEventListener(SETTINGS_UPDATED_EVENT, updateTheme); };
  }, [pinGate]);

  return (
    <div className="app" data-theme={theme} style={themes[theme].cssVariables as CSSProperties}>
      {pinGate === "checking" ? <main><p>잠금 상태 확인 중…</p></main> : pinGate === "error" ? <main className="session-empty"><p role="alert">잠금 상태를 확인하지 못했습니다.</p><button onClick={() => { setPinGate("checking"); setPinRetry((value) => value + 1); }} type="button">다시 시도</button></main> : pinGate === "locked" ? <UnlockScreen lockedUntil={lockedUntil} onUnlock={() => setPinGate("unlocked")} /> : <>
        {headerScreens.has(screen) && <AppHeader />}
        <main><AppRoutes /></main>
        {!navlessScreens.has(screen) && !sessionActive && <BottomNav />}
      </>}
    </div>
  );
}
