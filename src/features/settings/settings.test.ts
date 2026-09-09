import { describe, expect, it, vi } from "vitest";
import { shortcutRows } from "./ShortcutSheet";
import { createSettingsSaver, DAILY_GOAL, normalizeDailyGoal, toggleTrack } from "./useSettings";
import { DEFAULT_SOUND_MODE, ONYOMI_SCRIPTS, SOUND_MODES, THEME_IDS } from "../../shared/settings";
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

  it("defaults answer sounds on", () => {
    expect(SOUND_MODES).toEqual(["on", "off"]);
    expect(DEFAULT_SOUND_MODE).toBe("on");
  });

  it("offers only persisted visual themes", () => {
    expect(THEME_IDS).toEqual(["default", "quiet-technical"]);
  });

  it("serializes and coalesces all writes for one profile", async () => {
    const releases: Array<() => void> = [];
    const calls: Array<{ profileId: number; patch: unknown }> = [];
    const saver = createSettingsSaver((profileId, patch) => {
      calls.push({ profileId, patch });
      return new Promise<void>((resolve) => releases.push(resolve));
    });

    saver.update(7, "dailyGoal", 50);
    saver.update(7, "dailyGoal", 60);
    saver.update(7, "soundMode", "off");
    expect(calls).toEqual([{ profileId: 7, patch: { dailyGoal: 50 } }]);

    releases[0]();
    await vi.waitFor(() => expect(calls).toContainEqual({ profileId: 7, patch: { dailyGoal: 60, soundMode: "off" } }));
    releases[1]();
    await saver.flush(7);
    expect(saver.snapshot(7).optimistic).toEqual({});
  });

  it("keeps a failed profile-bound value for explicit retry and flush", async () => {
    let fail = true;
    const calls: Array<{ profileId: number; patch: unknown }> = [];
    const saver = createSettingsSaver(async (profileId, patch) => {
      calls.push({ profileId, patch });
      if (fail) throw new Error("offline");
    });

    saver.update(3, "theme", "default");
    await vi.waitFor(() => expect(saver.status(3).error).toBe("offline"));
    const snapshot = saver.snapshot(3);
    expect(snapshot.optimistic).toEqual({ theme: "default" });
    fail = false;
    await saver.flush(3);
    expect(calls).toEqual([
      { profileId: 3, patch: { theme: "default" } },
      { profileId: 3, patch: { theme: "default" } },
    ]);
    expect(saver.status(3)).toEqual({ saving: false, error: "" });
  });

  it("overlays an in-flight save on an old GET but trusts later fresh GETs", async () => {
    let release!: () => void;
    const saver = createSettingsSaver(() => new Promise<void>((resolve) => { release = resolve; }));
    const beforeEdit = saver.snapshot(1);
    saver.update(1, "dailyGoal", 80);
    const duringSave = saver.snapshot(1);
    expect(duringSave.optimistic).toEqual({ dailyGoal: 80 });
    release();
    await saver.flush(1);
    expect(saver.snapshot(1).optimistic).toEqual({});
    expect({ dailyGoal: 40, ...duringSave.optimistic, ...saver.optimisticSince(1, duringSave.revision) }).toEqual({ dailyGoal: 80 });
    expect({ dailyGoal: 40, ...beforeEdit.optimistic, ...saver.optimisticSince(1, beforeEdit.revision) }).toEqual({ dailyGoal: 80 });
    expect({ dailyGoal: 90, ...saver.snapshot(1).optimistic }).toEqual({ dailyGoal: 90 });
  });
});
