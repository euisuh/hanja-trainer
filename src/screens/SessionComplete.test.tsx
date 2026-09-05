import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SessionResult } from "../features/session/SessionRunner";
import { completeHeadline, SessionComplete } from "./SessionComplete";

function result(overrides: Partial<SessionResult> = {}): SessionResult {
  return {
    xp: 42,
    accuracy: 96,
    bestCombo: 7,
    nextReview: "내일",
    answered: 8,
    correct: 8,
    skipped: 0,
    profile: {
      id: 1,
      name: "나",
      isAdmin: true,
      xp: 1234,
      todayXp: 42,
      goal: 40,
      streak: 5,
      longestStreak: 8,
      enabledTracks: ["kr"],
    },
    ...overrides,
  };
}

describe("session-complete payoff", () => {
  it("selects a warm headline from accuracy", () => {
    expect(completeHeadline(95)).toBe("완벽했어요");
    expect(completeHeadline(80)).toBe("잘했어요");
    expect(completeHeadline(60)).toBe("좋아요");
    expect(completeHeadline(59)).toBe("끝까지 했어요");
  });

  it("renders final XP once for assistive tech and promotes profile progress", () => {
    const html = renderToStaticMarkup(<SessionComplete onHome={vi.fn()} result={result()} />);

    expect(html).toContain('class="session-complete__xp">+0 XP');
    expect(html).toContain('class="session-announcement">+42 XP');
    expect(html).toContain("<small>연속</small><strong>5일</strong>");
    expect(html).toContain("<small>오늘</small><strong>42/40 XP</strong>");
    expect(html).toContain("<small>누적</small><strong>1,234 XP</strong>");
    expect(html).not.toContain("<small>모름</small>");
    expect(html.indexOf("<small>정확도</small>")).toBeLessThan(html.indexOf("<small>응답</small>"));
  });

  it("demotes reported skips and warms unit-success copy", () => {
    const skipped = renderToStaticMarkup(<SessionComplete onHome={vi.fn()} result={result({ skipped: 2 })} />);
    const passed = renderToStaticMarkup(<SessionComplete onHome={vi.fn()} result={result({ unitTest: { passed: true, correct: 8, total: 8, required: 8, mistakes: 0 } })} />);

    expect(skipped).toContain('class="session-complete__stat--quiet"');
    expect(skipped).toContain("<small>모름</small><strong>2회</strong>");
    expect(passed).toContain("유닛을 건너뛰었어요");
  });
});
