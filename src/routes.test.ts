import { matchPath } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { routes } from "./routes";

describe("routes", () => {
  it("resolves /talk/diary to the diary screen before /talk/:unitId", () => {
    const screen = routes.find((route) => matchPath({ path: route.path, end: true }, "/talk/diary"))?.screen;
    expect(screen).toBe("talk-diary");
  });
});
