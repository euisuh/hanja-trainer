import type { ComponentType } from "react";
import { Navigate, useRoutes } from "react-router-dom";
import { AboutScreen } from "./screens/AboutScreen";
import { DetailScreen } from "./screens/DetailScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LessonScreen } from "./screens/LessonScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { PlacementResultScreen } from "./screens/PlacementResultScreen";
import { PlacementScreen } from "./screens/PlacementScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { SessionCompleteScreen } from "./screens/SessionCompleteScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { SpeakingScreen } from "./screens/SpeakingScreen";
import { StatsScreen } from "./screens/StatsScreen";
import { UnitStudyScreen } from "./screens/UnitStudyScreen";

export type Screen =
  | "onboarding"
  | "placement"
  | "placement-result"
  | "home"
  | "lesson"
  | "review"
  | "review-session"
  | "session-complete"
  | "detail"
  | "study"
  | "speaking"
  | "stats"
  | "settings"
  | "about";

type ScreenRoute = {
  screen: Screen;
  path: string;
  Component: ComponentType;
};

export const routes: readonly ScreenRoute[] = [
  { screen: "onboarding", path: "/onboarding", Component: OnboardingScreen },
  { screen: "placement", path: "/placement", Component: PlacementScreen },
  { screen: "placement-result", path: "/placement-result", Component: PlacementResultScreen },
  { screen: "home", path: "/home", Component: HomeScreen },
  { screen: "lesson", path: "/lesson", Component: LessonScreen },
  { screen: "review", path: "/review", Component: ReviewScreen },
  { screen: "review-session", path: "/review/session", Component: ReviewScreen },
  { screen: "session-complete", path: "/session-complete", Component: SessionCompleteScreen },
  { screen: "detail", path: "/detail/:key", Component: DetailScreen },
  { screen: "study", path: "/study/:unitId", Component: UnitStudyScreen },
  { screen: "speaking", path: "/speaking/:unitId", Component: SpeakingScreen },
  { screen: "stats", path: "/stats", Component: StatsScreen },
  { screen: "settings", path: "/settings", Component: SettingsScreen },
  { screen: "about", path: "/about", Component: AboutScreen },
];

export function AppRoutes() {
  return useRoutes([
    ...routes.map(({ path, Component }) => ({ path, element: <Component /> })),
    { path: "*", element: <Navigate to="/onboarding" replace /> },
  ]);
}
