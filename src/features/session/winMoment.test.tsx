import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FeedbackBar } from "./FeedbackBar";
import { ComboBadge } from "./ComboBadge";
import { correctHeadline, wrongHeadline } from "./feedbackCopy";
import { ParticleBurst, type BurstAnchor } from "./ParticleBurst";
import { autoAdvanceDelay, correctAnswerXp, recallPromptFor, type SessionMode } from "./SessionRunner";

describe("correct-answer win moment", () => {
  it("names each recall task without accepting a sibling reading", () => {
    expect(recallPromptFor("reading", "kr")).toContain("훈음");
    expect(recallPromptFor("reading", "jp")).toContain("音読み");
    expect(recallPromptFor("reading", "cn")).toContain("병음");
    expect(recallPromptFor("kun", "jp")).toContain("훈독");
    expect(recallPromptFor("meaning", "jp")).toContain("뜻");
    expect(recallPromptFor("word", "cn")).toContain("단어의 읽기");
  });
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
      <FeedbackBar answered cardIndex={0} combo={1} compare={false} correct correctIndex={0} last={false} lostCombo={0} note="다음 복습" onNext={vi.fn()} skipped={false} xp={14} />,
    );

    expect(html).toContain("정확해요");
    expect(html).toContain('class="feedback-bar__xp"');
    expect(html).toContain("+14 XP");
  });

  it.each([
    [2, 1, "2× 콤보"],
    [3, 2, "3× 좋아요"],
    [6, 3, "6× 불붙었어요"],
    [10, 4, "10× 무결점"],
  ])("renders combo %i at tier %i", (combo, tier, label) => {
    const html = renderToStaticMarkup(<ComboBadge combo={combo} />);

    expect(html).toContain(`data-tier="${tier}"`);
    expect(html).toContain(label);
  });

  it("keeps low combos hidden and grows XP through combo 14", () => {
    expect(renderToStaticMarkup(<ComboBadge combo={1} />)).toBe("");
    expect(correctAnswerXp(5)).toBe(25);
    expect(correctAnswerXp(14)).toBe(50);
    expect(correctAnswerXp(20)).toBe(50);
  });

  it("uses deterministic, varied feedback copy", () => {
    expect(correctHeadline(0, 1)).toBe("정확해요");
    expect(correctHeadline(1, 1)).not.toBe(correctHeadline(0, 1));
    const streakHeadline = correctHeadline(2, 4);
    expect(correctHeadline(2, 4)).toBe(streakHeadline);
    expect(correctHeadline(3, 5)).not.toBe(streakHeadline);
    expect(wrongHeadline(0)).toBe("아쉬워요");
    expect(wrongHeadline(1)).not.toBe(wrongHeadline(0));
  });

  it("shows a lost beat only for combos of three or more", () => {
    const render = (lostCombo: number) => renderToStaticMarkup(
      <FeedbackBar answered cardIndex={3} combo={0} compare={false} correct={false} correctIndex={0} last={false} lostCombo={lostCombo} note="다시 해봐요" onNext={vi.fn()} skipped={false} xp={0} />,
    );

    expect(render(2)).not.toContain("콤보가 끊겼어요");
    expect(render(5)).toContain("5× 콤보가 끊겼어요");
  });

  it("keeps sync errors ahead of structured answer feedback", () => {
    const html = renderToStaticMarkup(
      <FeedbackBar answered cardIndex={0} combo={0} compare={false} correct={false} correctAnswer="eat" correctAnswerLang="en" correctIndex={2} error="네트워크 오류" last={false} lostCombo={0} note="다시 해봐요" onNext={vi.fn()} skipped={false} />,
    );

    expect(html).toContain("저장하지 못했습니다");
    expect(html).toContain("네트워크 오류");
    expect(html).not.toContain("eat");
  });
});
