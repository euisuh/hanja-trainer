import type { ComponentType } from "react";
import { Navigate, useRoutes } from "react-router-dom";
import { DetailScreen } from "./screens/DetailScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LessonScreen } from "./screens/LessonScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { PlacementResultScreen } from "./screens/PlacementResultScreen";
import { PlacementScreen } from "./screens/PlacementScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { SessionCompleteScreen } from "./screens/SessionCompleteScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { StatsScreen } from "./screens/StatsScreen";

export type Screen =
  | "onboarding"
  | "placement"
  | "placement-result"
  | "home"
  | "lesson"
  | "review"
  | "session-complete"
  | "detail"
  | "stats"
  | "settings";

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
  { screen: "session-complete", path: "/session-complete", Component: SessionCompleteScreen },
  { screen: "detail", path: "/detail/:char", Component: DetailScreen },
  { screen: "stats", path: "/stats", Component: StatsScreen },
  { screen: "settings", path: "/settings", Component: SettingsScreen },
];

export function AppRoutes() {
  return useRoutes([
    ...routes.map(({ path, Component }) => ({ path, element: <Component /> })),
    { path: "*", element: <Navigate to="/onboarding" replace /> },
  ]);
}
