import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FeedbackBar } from "./FeedbackBar";
import { ParticleBurst, type BurstAnchor } from "./ParticleBurst";
import { autoAdvanceDelay, type SessionMode } from "./SessionRunner";

describe("correct-answer win moment", () => {
  it("keeps assessments and reduced motion fast", () => {
    const delay = (mode: SessionMode, reducedMotion = false) => autoAdvanceDelay(mode, true, reducedMotion);

    expect(delay("lesson")).toBe(900);
    expect(delay("review")).toBe(900);
    expect(delay("level-review")).toBe(900);
    expect(delay("placement")).toBe(400);
    expect(delay("unit-test")).toBe(400);
    expect(delay("lesson", true)).toBe(400);
  });

  it("places particles at the measured answer center", () => {
    const render = (anchor: BurstAnchor) => renderToStaticMarkup(
      <ParticleBurst anchor={anchor} onDone={vi.fn()} tier={2} track="kr" />,
    );
    const first = render({ x: 40, y: 80, width: 120, height: 50 });
    const fourth = render({ x: 400, y: 80, width: 120, height: 50 });

    expect(first).toContain("--burst-x:40px");
    expect(fourth).toContain("--burst-x:400px");
    expect(first).toContain("--burst-y:80px");
  });

  it("renders gained XP as a distinct pop pill", () => {
    const html = renderToStaticMarkup(
      <FeedbackBar answered compare={false} correct correctIndex={0} last={false} note="다음 복습" onNext={vi.fn()} skipped={false} xp={14} />,
    );

    expect(html).toContain("정확해요");
    expect(html).toContain('class="feedback-bar__xp"');
    expect(html).toContain("+14 XP");
  });
});
