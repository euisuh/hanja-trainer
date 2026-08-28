import type { CSSProperties } from "react";
import { matchPath, useLocation } from "react-router-dom";
import { cssVariables } from "./design/tokens";
import { AppRoutes, routes, type Screen } from "./routes";
import { AppHeader } from "./shell/AppHeader";
import { BottomNav } from "./shell/BottomNav";
import { useGlobalHotkeys } from "./shell/useGlobalHotkeys";

const headerScreens = new Set<Screen>(["home", "review", "stats", "settings", "detail"]);
const navlessScreens = new Set<Screen>(["onboarding", "placement", "placement-result"]);
const sessionScreens = new Set<Screen>(["placement", "lesson", "review-session", "session-complete"]);

export function App() {
  const { pathname } = useLocation();
  const screen = routes.find((route) => matchPath({ path: route.path, end: true }, pathname))?.screen ?? "onboarding";
  const sessionActive = sessionScreens.has(screen);

  useGlobalHotkeys({ sessionActive, modalOpen: false });

  return (
    <div className="app" style={cssVariables as CSSProperties}>
      {headerScreens.has(screen) && <AppHeader />}
      <main><AppRoutes /></main>
      {!navlessScreens.has(screen) && !sessionActive && <BottomNav />}
    </div>
  );
}
