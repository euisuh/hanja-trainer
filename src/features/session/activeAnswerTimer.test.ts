import { describe, expect, it } from "vitest";
import { createActiveAnswerTimer, MAX_ACTIVE_ANSWER_MS } from "./activeAnswerTimer";

describe("active answer timing", () => {
  it("excludes multiple paused segments and snapshots once", () => {
    let now = 0;
    const timer = createActiveAnswerTimer(() => now);

    timer.reset();
    now = 1_000;
    timer.pause();
    now = 31_000;
    timer.resume();
    now = 32_000;
    timer.pause();
    now = 62_000;
    timer.resume();
    now = 62_500;

    expect(timer.snapshot()).toBe(2_500);
    now = 70_000;
    expect(timer.snapshot()).toBe(2_500);
  });

  it("caps genuine active thinking at the API limit", () => {
    let now = 0;
    const timer = createActiveAnswerTimer(() => now);

    timer.reset();
    now = MAX_ACTIVE_ANSWER_MS + 1;

    expect(timer.snapshot()).toBe(MAX_ACTIVE_ANSWER_MS);
  });

  it("keeps a reset timer stopped until explicitly resumed", () => {
    let now = 0;
    const timer = createActiveAnswerTimer(() => now);

    timer.reset(false);
    now = 60_000;
    timer.resume();
    now = 61_000;

    expect(timer.snapshot()).toBe(1_000);
  });
});
