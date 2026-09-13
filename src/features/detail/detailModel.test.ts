import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { initialState, type ReviewLogEntry } from "../../../shared/fsrs";
import type { CharacterEntry } from "../../../shared/types";
import { IntervalChart } from "./IntervalChart";
import { TrackPanel } from "./TrackPanel";
import { buildIntervalBars, recordValues, variantsLabel } from "./detailModel";

const character: CharacterEntry = {
  id: 1, key: "學", meaningEn: "learn", meaningKo: "배울", variants: {}, strokeCount: 16, createdAt: 0, sentences: [],
  tracks: [
    { characterId: 1, track: "kr", glyph: "學", reading: "배울 학", level: "8급", levelOrd: 1 },
    { characterId: 1, track: "jp", glyph: "学", on: "ガク", kun: "まな-ぶ", kanken: "10級", jlpt: "N5", levelOrd: 1 },
    { characterId: 1, track: "cn", glyph: "学", pinyin: "xué", meaning: "learn", hsk: "HSK 1", tier: "一级字", levelOrd: 1 },
  ],
};

describe("detail model", () => {
  it("normalizes real interval history and preserves its values", () => {
    const logs = [1, 4, 10].map((scheduledDaysAfter): ReviewLogEntry => ({ rating: "good", answeredAt: new Date(), scheduledDaysBefore: 0, scheduledDaysAfter }));
    const bars = buildIntervalBars(logs);
    expect(bars.map((bar) => bar.days)).toEqual([1, 4, 10]);
    expect(bars.map((bar) => bar.height)).toEqual([expect.closeTo(8.2), expect.closeTo(32.8), 82]);
  });

  it("labels divergent variants and reports honest missing history", () => {
    expect(variantsLabel(character, ["kr", "jp", "cn"])).toBe("學 (KR) / 学 (JP) / 学 (CN)");
    expect(recordValues(undefined)).toBeNull();
  });

  it("formats due review state without dividing by zero", () => {
    const now = new Date("2026-01-02T00:00:00Z");
    expect(recordValues({ ...initialState(now), difficulty: 4.25, due: now }, now)).toEqual({ accuracy: "0%", reps: "0회", due: "지금", difficulty: "4.3 / 10" });
  });

  it("uses text for zero or one interval and bars for interval history", () => {
    const render = (intervals: number[]) => renderToStaticMarkup(createElement(IntervalChart, { accent: "#000", intervals }));

    expect(render([])).toContain("아직 복습 간격 기록이 없습니다.");
    expect(render([3])).toContain("첫 복습 완료 · 다음 간격 <strong>+3일</strong>");
    expect(render([3])).not.toContain('class="interval-chart__bars"');
    expect(render([3, 5]).match(/class="interval-chart__bar"/gu)).toHaveLength(2);
  });

  it("labels a Chinese panel's existing definition as English", () => {
    const html = renderToStaticMarkup(createElement(TrackPanel, { entry: {
      track: "cn", glyph: "吃", reading: "chī", meaning: "eat", level_badges: ["HSK 1"], sentences: [], review_state: null,
    }, onyomiScript: "katakana" }));

    expect(html).toContain('class="track-panel__meaning" lang="en">eat</p>');
    expect(html).not.toContain("말 더듬을");
  });
});
