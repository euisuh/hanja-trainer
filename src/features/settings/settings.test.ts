import { describe, expect, it } from "vitest";
import { shortcutRows } from "./ShortcutSheet";
import { DAILY_GOAL, normalizeDailyGoal, toggleTrack } from "./useSettings";
import { ONYOMI_SCRIPTS, THEME_IDS } from "../../shared/settings";
import { GLOBAL_DESTINATIONS, SHORTCUTS } from "../../shell/shortcuts";

describe("settings", () => {
  it("renders the same shortcut registry consumed by global navigation", () => {
    expect(shortcutRows).toBe(SHORTCUTS);
    const navigation = SHORTCUTS.find((shortcut) => shortcut.id === "navigation");
    expect(GLOBAL_DESTINATIONS).toEqual(navigation?.destinations);
  });

  it("blocks the last track from being disabled", () => {
    expect(toggleTrack(["kr"], "kr")).toEqual(["kr"]);
    expect(toggleTrack(["kr", "jp"], "kr")).toEqual(["jp"]);
    expect(toggleTrack(["kr"], "cn")).toEqual(["kr", "cn"]);
  });

  it("clamps and steps the daily goal", () => {
    expect(normalizeDailyGoal(1)).toBe(DAILY_GOAL.min);
    expect(normalizeDailyGoal(67)).toBe(70);
    expect(normalizeDailyGoal(999)).toBe(DAILY_GOAL.max);
  });

  it("offers only canonical on'yomi display scripts", () => {
    expect(ONYOMI_SCRIPTS).toEqual(["katakana", "hiragana"]);
  });

  it("offers only persisted visual themes", () => {
    expect(THEME_IDS).toEqual(["default", "quiet-technical"]);
  });
});
