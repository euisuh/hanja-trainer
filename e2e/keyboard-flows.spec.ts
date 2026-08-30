import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const languages = { kr: "ko", jp: "ja", cn: "zh-Hans" } as const;
type Card = { answerIndex: number; characterKey: string; kind: "compare" | "reading" | "word"; levelOrd: number; options: Array<{ label: string }>; sentence: { source: string; targetIndex: number; text: string; translation: string } | null; track: keyof typeof languages; wordId?: number };
type SessionResponse = { cards: Card[]; sessionId: string };
const NUDGE_SNOOZES_KEY = "hanja-trainer:track-imbalance-snoozes";
const MAIN_CORRECT_ADVANCE_BASELINE_MS = 270;

async function expectClosestLang(locator: Locator, lang: string) {
  expect(await locator.evaluate((node) => node.closest("[lang]")?.getAttribute("lang"))).toBe(lang);
}

async function sessionStarted(page: Page, action: () => Promise<void>): Promise<SessionResponse> {
  const response = page.waitForResponse((candidate) => candidate.url().endsWith("/api/session/start") && candidate.ok());
  await action();
  return await (await response).json() as SessionResponse;
}

type FinishOptions = { announcement?: string; autoAdvance?: boolean; keyboardAdvance?: "Enter" | "Space"; measureCorrectLatency?: boolean; progressOffset?: number; skipFirst?: boolean; verifyCelebration?: boolean; verifyLanguages?: boolean; verifyReducedMotion?: boolean };

async function finishSession(page: Page, cards: Card[], completion = /세션 완료/u, options: FinishOptions = {}) {
  let skipped = false;
  let checkedAnnouncement = false;
  let testedKeyboardAdvance = false;
  let correctAdvanceMs = 0;
  let correctTransitions = 0;
  let firstBurstParticles = 0;
  let tierThreeParticles = 0;
  let maxLiveBursts = 0;
  let checkedSurvival = false;
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    const shouldSkip = card.kind === "reading" && Boolean(options.skipFirst) && !skipped;
    const testKeyboardAdvance = card.kind !== "compare" && !shouldSkip && Boolean(options.keyboardAdvance) && !testedKeyboardAdvance;
    if (testKeyboardAdvance) {
      const clockStart = Date.now();
      await page.clock.install({ time: clockStart });
      await page.clock.pauseAt(clockStart + 1_000);
      await page.locator(".session-card-wrap").evaluate((node) => node.setAttribute("data-tested-keyboard-advance", "true"));
    }
    if (options.verifyLanguages) {
      await expectClosestLang(page.locator(".quiz-card__glyph"), languages[card.track]);
      if (card.kind !== "compare") {
        await expectClosestLang(page.locator(".answer-option__copy strong").first(), languages[card.track]);
        if (await page.locator(".quiz-card__sentence p").count() > 0) {
          await expectClosestLang(page.locator(".quiz-card__sentence p"), languages[card.track]);
          const translation = page.locator(".quiz-card__sentence small");
          if (await translation.count() > 0) await expectClosestLang(translation, languages.kr);
        }
      } else {
        const panels = page.locator(".compare-card__panel");
        for (let panelIndex = 0; panelIndex < await panels.count(); panelIndex += 1) {
          const panel = panels.nth(panelIndex);
          const panelTrack = (await panel.getAttribute("class"))?.match(/compare-card__panel--(kr|jp|cn)/u)?.[1] as keyof typeof languages | undefined;
          expect(panelTrack).toBeTruthy();
          if (panelTrack) await expectClosestLang(panel, languages[panelTrack]);
        }
      }
    }
    if (card.kind !== "compare") {
      if (options.measureCorrectLatency && !shouldSkip && index + 1 < cards.length) {
        await page.evaluate(() => {
          const progress = document.querySelector('[role="progressbar"]');
          if (!progress) throw new Error("missing session progressbar");
          const initialProgress = progress.getAttribute("aria-valuenow");
          let answerStarted: number | undefined;
          const onKeyDown = () => { answerStarted = performance.now(); };
          const observer = new MutationObserver(() => {
            if (answerStarted === undefined || progress.getAttribute("aria-valuenow") === initialProgress) return;
            observer.disconnect();
            window.removeEventListener("keydown", onKeyDown, true);
            document.documentElement.dataset.correctAdvanceMs = String(performance.now() - answerStarted);
          });
          document.documentElement.dataset.correctAdvanceMs = "";
          window.addEventListener("keydown", onKeyDown, { capture: true, once: true });
          observer.observe(progress, { attributeFilter: ["aria-valuenow"], attributes: true });
        });
      }
      await page.keyboard.press(shouldSkip ? "0" : String(card.answerIndex + 1));
      if (options.announcement && !shouldSkip && !checkedAnnouncement) {
        await expect(page.locator(".session-announcement")).toContainText(options.announcement);
        checkedAnnouncement = true;
      }
      if (shouldSkip) {
        skipped = true;
        await expect(page.locator(".feedback-bar")).toContainText(/모름 · 정답 \S/u);
        await expect(page.locator(".feedback-bar")).toContainText(/= \S/u);
      }
    } else {
      const progress = await page.getByRole("progressbar", { name: /진행률/u }).getAttribute("aria-valuenow");
      await page.keyboard.press("1");
      await expect(page.getByRole("progressbar", { name: /진행률/u })).toHaveAttribute("aria-valuenow", progress ?? "0");
    }
    if (testKeyboardAdvance) {
      await page.evaluate((primaryKey) => {
        window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: primaryKey }));
        window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: primaryKey === "Enter" ? " " : "Enter" }));
      }, options.keyboardAdvance!);
      await expect(page.locator('[data-tested-keyboard-advance="true"]')).toHaveCount(0);
      testedKeyboardAdvance = true;
      if (index + 1 < cards.length) {
        await page.locator(".session-card-wrap").evaluate((node) => node.setAttribute("data-tested-no-double-advance", "true"));
        await page.clock.runFor(500);
        await expect(page.locator('[data-tested-no-double-advance="true"]')).toBeVisible();
      }
      await page.clock.resume();
    } else if (!options.autoAdvance || card.kind === "compare" || shouldSkip) {
      await page.keyboard.press("Enter");
    }
    if (index + 1 < cards.length) {
      const completed = (options.progressOffset ?? 0) + cards.slice(0, index + 1).filter((item) => item.kind !== "compare").length;
      const next = cards[index + 1];
      if (options.measureCorrectLatency && card.kind !== "compare" && !shouldSkip) {
        await page.waitForFunction(() => document.documentElement.dataset.correctAdvanceMs !== "");
        correctAdvanceMs += await page.evaluate(() => {
          const elapsed = Number(document.documentElement.dataset.correctAdvanceMs);
          delete document.documentElement.dataset.correctAdvanceMs;
          return elapsed;
        });
        correctTransitions += 1;
      }
      await expect(page.getByRole("progressbar", { name: /진행률/u })).toHaveAttribute("aria-valuenow", String(completed + Number(next.kind !== "compare")));
    }
    if (card.kind !== "compare" && !shouldSkip && (options.verifyCelebration || options.verifyReducedMotion)) {
      const layer = page.locator(".celebration-layer");
      const burst = layer.locator(".particle-burst").last();
      await expect(layer).toHaveAttribute("aria-hidden", "true");
      await expect(page.locator(".session-card-wrap .celebration-layer")).toHaveCount(0);
      expect(await layer.evaluate((node) => getComputedStyle(node).pointerEvents)).toBe("none");
      await expect(burst).toBeAttached();
      if (options.verifyReducedMotion) await expect(layer).toBeHidden();
      if (options.verifyCelebration) {
        const liveBursts = await layer.locator(".particle-burst").count();
        expect(liveBursts).toBeLessThanOrEqual(3);
        maxLiveBursts = Math.max(maxLiveBursts, liveBursts);
        const particles = await burst.locator(".particle-burst__particle").count();
        if (await burst.getAttribute("data-tier") === "1") firstBurstParticles = particles;
        if (await burst.getAttribute("data-tier") === "3") tierThreeParticles = particles;
        if (!checkedSurvival) {
          await expect(burst).toBeAttached();
          await expect(burst).toHaveCount(0, { timeout: 2_000 });
          checkedSurvival = true;
        }
      }
    }
  }
  await expect(page.getByRole("heading", { name: completion })).toBeVisible();
  if (options.verifyCelebration) {
    expect(maxLiveBursts).toBeGreaterThan(1);
    expect(tierThreeParticles).toBeGreaterThan(firstBurstParticles);
  }
  return { correctAdvanceMs, correctTransitions };
}

async function answerUnitCard(page: Page, cards: Card[], correct: boolean, input: "keyboard" | "mouse" = "keyboard"): Promise<number> {
  const options = page.locator(".answer-option__copy strong");
  const labels = await options.allTextContents();
  const cardIndex = cards.findIndex((card) => card.options.map((option) => option.label).join("\u0000") === labels.join("\u0000"));
  expect(cardIndex).toBeGreaterThanOrEqual(0);
  const answerIndex = cards[cardIndex].answerIndex;
  const choice = correct ? answerIndex : (answerIndex + 1) % labels.length;
  if (input === "mouse") await page.locator(".answer-option").nth(choice).click();
  else await page.keyboard.press(String(choice + 1));
  await expect(page.locator(".answer-option").first()).toHaveAttribute("aria-disabled", "true");
  return cardIndex;
}

async function waitForUnitAdvance(page: Page) {
  await expect(page.locator(".answer-option").first()).toHaveAttribute("aria-disabled", "false");
}

function expectReadingOnly(cards: Card[]) {
  for (const card of cards.filter((item) => item.kind !== "compare")) {
    expect(card.options.every((option) => Object.keys(option).join() === "label")).toBe(true);
  }
}

async function checkLayout(page: Page, name: string, testInfo: TestInfo) {
  for (const width of [430, 1080]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ fullPage: true, path: testInfo.outputPath(`${name}-${width}.png`) });
  }
}

async function checkAnswerGrid(page: Page) {
  for (const width of [561, 720, 900, 1080, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const boxes = await page.locator(".answer-option").evaluateAll((options) => options.map((option) => {
      const box = option.getBoundingClientRect();
      return { x: box.x, y: box.y, height: box.height };
    }));
    expect(boxes).toHaveLength(4);
    expect(boxes[0].y).toBe(boxes[1].y);
    expect(boxes[2].y).toBe(boxes[3].y);
    expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
    expect(boxes[0].x).toBe(boxes[2].x);
    expect(boxes[0].height).toBe(boxes[1].height);
    expect(boxes[2].height).toBe(boxes[3].height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 430, height: 900 });
  const mobile = await page.locator(".answer-option").evaluateAll((options) => options.map((option) => option.getBoundingClientRect().y));
  expect(new Set(mobile).size).toBe(4);
}

test.describe.serial("keyboard-only product flows", () => {
  test("cold start, onboarding and placement", async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: "한 글자, 세 개의 시험." })).toBeVisible();
    await checkLayout(page, "onboarding", testInfo);
    expect(await page.locator(".onboarding-cta").evaluate((node) => Number.parseFloat(getComputedStyle(node).animationDuration))).toBeLessThanOrEqual(0.01);

    await page.keyboard.press("2");
    await expect(page.getByRole("button", { name: /日本/u })).toHaveAttribute("aria-pressed", "false");
    const placementRequest = page.waitForRequest((request) => request.url().endsWith("/api/session/start"));
    const placement = await sessionStarted(page, () => page.keyboard.press("Enter"));
    expect((await placementRequest).postDataJSON()).toMatchObject({ mode: "placement", tracks: ["kr", "cn"], limit: 15 });
    expect(placement.cards).toHaveLength(15);
    expectReadingOnly(placement.cards);
    await expect(page.getByRole("progressbar", { name: /진행률/u })).toBeVisible();
    await checkAnswerGrid(page);
    await checkLayout(page, "placement", testInfo);
    await finishSession(page, placement.cards, /현재 콘텐츠의 끝/u, { announcement: "응답을 기록했습니다. 다음 문항으로 이동합니다.", autoAdvance: true, verifyReducedMotion: true });
    await expect(page.getByRole("heading", { name: "현재 콘텐츠의 끝까지 도달했습니다." })).toBeVisible();
    await checkLayout(page, "placement-result", testInfo);
    await page.keyboard.press("Enter");
    await expect(page.locator(".home-screen")).toBeVisible();
    await checkLayout(page, "home", testInfo);

    await page.keyboard.press("T");
    await expect(page.getByRole("heading", { name: "통계" })).toBeVisible();
    await expect(page.locator(".track-mastery-card")).toHaveCount(2);
    await page.keyboard.press("H");
    await expect(page.locator(".home-screen")).toBeVisible();
  });

  test("lesson, pause focus trap and completion", async ({ page }, testInfo) => {
    await page.goto("/home");
    await expect(page.getByRole("button", { name: /레슨 시작/u })).toBeVisible();
    const startRequest = page.waitForRequest((request) => request.url().endsWith("/api/session/start"));
    const lesson = await sessionStarted(page, () => page.keyboard.press("Enter"));
    expect((await startRequest).postDataJSON()).toMatchObject({ mode: "lesson", tracks: ["kr"], limit: 8, unitId: expect.any(Number) });
    expectReadingOnly(lesson.cards);
    await checkAnswerGrid(page);
    await page.setViewportSize({ width: 1080, height: 900 });
    await expect(page.locator(".quiz-card__glyph")).toHaveCSS("font-size", "150px");
    await page.setViewportSize({ width: 430, height: 900 });
    await expect(page.locator(".quiz-card__glyph")).toHaveCSS("font-size", "108px");
    await checkLayout(page, "lesson", testInfo);

    await page.keyboard.press("Tab");
    const opener = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute("aria-label"));
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "일시정지" })).toBeVisible();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /계속하기/u })).toBeFocused();
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute("aria-label"))).toBe(opener);

    const sourceCardIndex = lesson.cards.findIndex((card, index) => card.kind === "reading" && card.sentence !== null && lesson.cards.slice(index + 1).some((later) => later.kind === "reading"));
    expect(sourceCardIndex).toBeGreaterThanOrEqual(0);
    for (const card of lesson.cards.slice(0, sourceCardIndex)) {
      if (card.kind !== "compare") await page.keyboard.press(String(card.answerIndex + 1));
      await page.keyboard.press("Enter");
    }
    const sourceProgress = lesson.cards.slice(0, sourceCardIndex + 1).filter((card) => card.kind !== "compare").length;
    await expectClosestLang(page.locator(".quiz-card__glyph"), languages[lesson.cards[sourceCardIndex].track]);
    await expectClosestLang(page.locator(".answer-option__copy strong").first(), languages[lesson.cards[sourceCardIndex].track]);
    const wrongIndex = lesson.cards[sourceCardIndex].answerIndex === 1 ? 2 : 1;
    const clickedAnswer = page.locator(".answer-option").nth(wrongIndex);
    await clickedAnswer.click();
    await expect(clickedAnswer).toBeFocused();
    await expect(clickedAnswer).toHaveAttribute("aria-disabled", "true");
    await page.locator(".session-card-wrap").evaluate((card) => card.setAttribute("data-tested-hold", "true"));
    await page.waitForTimeout(500);
    await expect(page.locator('[data-tested-hold="true"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /다음 카드/u })).toBeVisible();
    await clickedAnswer.press("Enter");
    await expect(page.getByRole("progressbar", { name: /진행률/u })).toHaveAttribute("aria-valuenow", String(sourceProgress));
    const sourceLink = page.locator(".quiz-card__sentence a").first();
    await sourceLink.evaluate((link) => link.addEventListener("click", (event) => {
      event.preventDefault();
      link.setAttribute("data-keyboard-activated", "true");
    }, { once: true }));
    await sourceLink.press("Enter");
    await expect(sourceLink).toHaveAttribute("data-keyboard-activated", "true");
    await sourceLink.press("Space");
    await expect(page.getByRole("progressbar", { name: /진행률/u })).toHaveAttribute("aria-valuenow", String(sourceProgress));
    await clickedAnswer.focus();
    await clickedAnswer.press("Shift+Tab");
    await expect(page.locator(".answer-option").nth(wrongIndex - 1)).toBeFocused();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-tested-hold="true"]')).toHaveCount(0);

    await finishSession(page, lesson.cards.slice(sourceCardIndex + 1), /세션 완료/u, { announcement: "정답입니다. 다음 문항으로 이동합니다.", autoAdvance: true, keyboardAdvance: "Enter", progressOffset: sourceProgress, skipFirst: true, verifyLanguages: true });
    await expect.poll(async () => (await (await page.request.get("/api/stats")).json() as { skipped: number }).skipped).toBeGreaterThan(0);
    await checkLayout(page, "session-complete", testInfo);
    await page.keyboard.press("Enter");
    await expect(page.locator(".home-screen")).toBeVisible();
  });

  test("unit test-out repeats every character and only advances on perfection", async ({ page }) => {
    await page.goto("/home");
    const launch = page.getByRole("button", { name: /이 유닛 건너뛰기/u });
    await expect(launch).toBeVisible();
    const before = await (await page.request.get("/api/curriculum?track=kr")).json() as { units: Array<{ id: number; current: boolean; progress: { known: number }; nodes: Array<{ state: string }> }> };
    const xpBefore = (await (await page.request.get("/api/profile")).json() as { xp: number }).xp;
    const current = before.units.find((unit) => unit.current)!;

    const firstRequest = page.waitForRequest((request) => request.url().endsWith("/api/session/start"));
    await launch.focus();
    const first = await sessionStarted(page, () => page.keyboard.press("Enter"));
    expect((await firstRequest).postDataJSON()).toMatchObject({ mode: "lesson", tracks: ["kr"], unitId: current.id, testOut: true });
    await page.setViewportSize({ width: 430, height: 900 });
    expect((await page.locator(".session-runner").boundingBox())?.y).toBeLessThan(32);
    expect(first.cards.length).toBeGreaterThan(0);
    expect(first.cards.length % 2).toBe(0);
    expect(first.cards.every((card) => card.kind === "reading" && card.track === "kr")).toBe(true);
    const grouped = Map.groupBy(first.cards, (card) => card.characterKey);
    expect([...grouped.values()].every((cards) => cards.length === 2)).toBe(true);
    expect(first.cards.every((card, index) => index === 0 || card.characterKey !== first.cards[index - 1].characterKey)).toBe(true);
    for (const cards of grouped.values()) {
      expect(cards[0].answerIndex).not.toBe(cards[1].answerIndex);
      const wrong = (card: Card) => card.options.filter((_, index) => index !== card.answerIndex).map((option) => option.label).sort();
      expect(wrong(cards[0])).not.toEqual(wrong(cards[1]));
    }

    await page.keyboard.press(String(first.cards[0].answerIndex + 1));
    const reloaded = await sessionStarted(page, () => page.reload());
    expect(reloaded.sessionId).not.toBe(first.sessionId);
    await expect(page.locator(".quiz-card")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Q");
    await expect(page.locator(".home-screen")).toBeVisible();
    const afterAbandon = await (await page.request.get("/api/curriculum?track=kr")).json() as typeof before;
    expect(afterAbandon.units.find((unit) => unit.current)?.id).toBe(current.id);
    expect(afterAbandon.units.find((unit) => unit.id === current.id)?.progress.known).toBe(current.progress.known);

    const failed = await sessionStarted(page, () => page.getByRole("button", { name: /이 유닛 건너뛰기/u }).press("Enter"));
    const failedCompletion = page.waitForRequest((request) => request.url().includes(`/api/curriculum/units/${current.id}/test-out`));
    const failedResponse = page.waitForResponse((response) => response.url().includes(`/api/curriculum/units/${current.id}/test-out`));
    await expect(page.locator(".unit-test-hearts")).toHaveAccessibleName("남은 하트 3개");
    await expect(page.locator(".feedback-bar").getByRole("button")).toHaveCount(0);
    for (let mistake = 1; mistake <= 3; mistake += 1) {
      await answerUnitCard(page, failed.cards, false);
      await expect(page.locator(".unit-test-hearts")).toHaveAccessibleName(`남은 하트 ${3 - mistake}개`);
      if (mistake < 3) await waitForUnitAdvance(page);
    }
    await expect(page.getByRole("heading", { name: /유닛 테스트 실패/u })).toBeVisible();
    await expect(page.getByRole("heading", { name: /유닛 테스트 실패/u })).toBeFocused();
    expect((await failedCompletion).postDataJSON()).toMatchObject({ sessionId: failed.sessionId, answers: expect.arrayContaining([expect.objectContaining({ selectedIndex: expect.any(Number) })]) });
    expect(await (await failedResponse).json()).toMatchObject({ passed: false, mistakes: 3 });
    await page.keyboard.press("Enter");
    await expect(page.locator(".home-screen")).toBeVisible();
    const afterFailure = await (await page.request.get("/api/curriculum?track=kr")).json() as typeof before;
    expect(afterFailure.units.find((unit) => unit.current)?.id).toBe(current.id);
    expect(afterFailure.units.find((unit) => unit.id === current.id)?.progress.known).toBe(current.progress.known);
    expect((await (await page.request.get("/api/profile")).json() as { xp: number }).xp).toBe(xpBefore);

    const second = await sessionStarted(page, () => page.getByRole("button", { name: /이 유닛 건너뛰기/u }).press("Space"));
    const recoveredCard = await answerUnitCard(page, second.cards, false, "mouse");
    await expect(page.locator(".unit-test-hearts")).toHaveAccessibleName("남은 하트 2개");
    await expect(page.locator(".feedback-bar")).toContainText("틀린 문항은 뒤에서 다시 나옵니다.");
    await expect(page.locator(".session-announcement")).toContainText(`정답은 ${second.cards[recoveredCard].options[second.cards[recoveredCard].answerIndex].label}`);
    await waitForUnitAdvance(page);
    await expect(page.locator(".session-announcement")).toContainText("오답입니다");
    const cleared = new Set<number>();
    const correctOrder: number[] = [];
    let responses = 1;
    while (cleared.size < second.cards.length) {
      const cardIndex = await answerUnitCard(page, second.cards, true);
      cleared.add(cardIndex);
      correctOrder.push(cardIndex);
      responses += 1;
      if (cleared.size < second.cards.length) await waitForUnitAdvance(page);
    }
    expect(cleared.size).toBe(second.cards.length);
    expect(responses).toBe(second.cards.length + 1);
    expect([...cleared].includes(recoveredCard)).toBe(true);
    expect(correctOrder.indexOf(recoveredCard)).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { name: /유닛 건너뛰기 성공/u })).toBeVisible();
    await expect(page.getByRole("heading", { name: /유닛 건너뛰기 성공/u })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator(".home-screen")).toBeVisible();
    const afterSuccess = await (await page.request.get("/api/curriculum?track=kr")).json() as typeof before;
    const completed = afterSuccess.units.find((unit) => unit.id === current.id)!;
    expect(completed.nodes.every((node) => node.state === "done")).toBe(true);
    expect(completed.progress.known).toBe(current.progress.known);
    expect(afterSuccess.units.find((unit) => unit.current)?.id).not.toBe(current.id);
    await expect(page.getByRole("button", { name: /이 유닛 건너뛰기/u })).toBeVisible();
  });

  test("track imbalance quick-start scopes every CTA path and snoozes", async ({ page }) => {
    let statsRequests = 0;
    let statsFail = false;
    let tracks = [
      { track: "kr", known: 20, total: 150, pct: 13.3, currentLevel: "8급" },
      { track: "cn", known: 10, total: 466, pct: 2.1, currentLevel: "HSK 1" },
    ];
    await page.route("**/api/stats", async (route) => {
      statsRequests += 1;
      if (statsFail) await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "temporary" } }) });
      else await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ streak: 0, longestStreak: 0, calendar: [], tracks }) });
    });

    const sessionBodies: unknown[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/api/session/start")) sessionBodies.push(request.postDataJSON());
    });
    const nudge = page.locator(".track-imbalance");
    const quickStart = page.getByRole("button", { name: /이 트랙 학습/u });

    async function expectScopedStart(action: () => Promise<void>) {
      const request = page.waitForRequest((candidate) => candidate.url().endsWith("/api/session/start"));
      await action();
      expect((await request).postDataJSON()).toMatchObject({ mode: "lesson", tracks: ["cn"], limit: 8 });
      await expect(page.locator(".quiz-card")).toBeVisible();
    }

    async function reloadWithStats() {
      const response = page.waitForResponse((candidate) => candidate.url().endsWith("/api/stats"));
      await page.reload();
      await response;
    }

    async function showNudgeAgain() {
      await page.goto("/home");
      await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ cn: Date.now() - 1 })), NUDGE_SNOOZES_KEY);
      await reloadWithStats();
      await expect(nudge).toBeVisible();
    }

    await page.goto("/home");
    await expect(nudge).toContainText("汉字 · HSK");
    await page.keyboard.press("ArrowRight");
    expect(statsRequests).toBe(1);

    for (const modifier of ["metaKey", "ctrlKey", "altKey"]) {
      await page.dispatchEvent("body", "keydown", { key: "l", [modifier]: true });
    }
    expect(sessionBodies).toHaveLength(0);
    await expectScopedStart(() => page.keyboard.press("L"));
    const actedRemaining = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").cn - Date.now(), NUDGE_SNOOZES_KEY);
    expect(actedRemaining).toBeGreaterThan(14 * 86_400_000 - 5_000);
    expect(actedRemaining).toBeLessThanOrEqual(14 * 86_400_000);

    await showNudgeAgain();
    for (let tabs = 0; tabs < 10 && !(await quickStart.evaluate((node) => node === document.activeElement)); tabs += 1) await page.keyboard.press("Tab");
    await expect(quickStart).toBeFocused();
    await expectScopedStart(() => page.keyboard.press("Enter"));

    await showNudgeAgain();
    await expectScopedStart(() => quickStart.click());

    await page.goto("/home");
    await expect(nudge).toHaveCount(0);
    await page.keyboard.press("L");
    expect(sessionBodies).toHaveLength(3);

    tracks = [
      { track: "kr", known: 20, total: 150, pct: 13.3, currentLevel: "8급" },
      { track: "cn", known: 11, total: 466, pct: 2.4, currentLevel: "HSK 1" },
    ];
    await page.evaluate((key) => localStorage.removeItem(key), NUDGE_SNOOZES_KEY);
    await reloadWithStats();
    await expect(nudge).toHaveCount(0);
    await page.keyboard.press("L");
    expect(sessionBodies).toHaveLength(3);

    tracks = [{ track: "kr", known: 100, total: 150, pct: 66.7, currentLevel: "8급" }];
    await reloadWithStats();
    await expect(nudge).toHaveCount(0);

    tracks = [
      { track: "kr", known: 19, total: 150, pct: 12.7, currentLevel: "8급" },
      { track: "cn", known: 0, total: 466, pct: 0, currentLevel: "HSK 1" },
    ];
    await reloadWithStats();
    await expect(nudge).toHaveCount(0);

    tracks[0].known = 20;
    await reloadWithStats();
    await expect(nudge).toBeVisible();
    await page.getByRole("button", { name: "이번 주 숨기기" }).click();
    await expect(nudge).toHaveCount(0);
    const remaining = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").cn - Date.now(), NUDGE_SNOOZES_KEY);
    expect(remaining).toBeGreaterThan(7 * 86_400_000 - 5_000);
    expect(remaining).toBeLessThanOrEqual(7 * 86_400_000);
    await reloadWithStats();
    await expect(nudge).toHaveCount(0);

    statsFail = true;
    await page.evaluate((key) => localStorage.removeItem(key), NUDGE_SNOOZES_KEY);
    await reloadWithStats();
    await expect(page.locator(".path-map")).toBeVisible();
    await expect(nudge).toHaveCount(0);
  });

  test("review queue decreases and reaches its empty state", async ({ page }, testInfo) => {
    await page.goto("/home");
    await expect(page.getByRole("button", { name: /레슨 시작/u })).toBeVisible();
    const review = await sessionStarted(page, () => page.keyboard.press("R"));
    expectReadingOnly(review.cards);
    const before = await page.request.get("/api/reviews/due?tracks=kr,cn&limit=100");
    const beforeTotal = (await before.json() as { total: number }).total;
    expect(beforeTotal).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: /복습 시작/u })).toBeVisible();
    const dueGlyphs = page.locator(".due-row__glyph");
    for (let index = 0; index < await dueGlyphs.count(); index += 1) {
      const glyph = dueGlyphs.nth(index);
      const track = (await glyph.getAttribute("class"))?.match(/due-row__glyph--(kr|jp|cn)/u)?.[1] as keyof typeof languages | undefined;
      expect(track).toBeTruthy();
      if (track) {
        await expectClosestLang(glyph, languages[track]);
        await expectClosestLang(page.locator(".due-row__copy small").nth(index), languages[track]);
      }
    }
    await checkLayout(page, "review", testInfo);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("progressbar", { name: /진행률/u })).toBeVisible();
    await checkAnswerGrid(page);
    await finishSession(page, review.cards, /세션 완료/u, { announcement: "정답입니다. 다음 문항으로 이동합니다.", autoAdvance: true, keyboardAdvance: "Space" });
    await page.keyboard.press("Enter");
    await expect(page.locator(".home-screen")).toBeVisible();
    await expect.poll(async () => {
      const after = await page.request.get("/api/reviews/due?tracks=kr,cn&limit=100");
      return (await after.json() as { total: number }).total;
    }).toBe(0);
    await page.keyboard.press("R");
    await expect(page.getByText("오늘 복습할 카드가 없습니다")).toBeVisible();
  });

  test("known Korean constituents unlock a keyboard-graded word card", async ({ page }) => {
    expect((await page.request.patch("/api/settings", { data: { enabledTracks: ["kr"] } })).ok()).toBe(true);
    const seeded = ["學", "校", "金", "大"].map((characterKey, cardIndex) => ({
      sessionId: "e2e-word-eligibility",
      cardIndex,
      characterKey,
      track: "kr",
      correct: false,
      skipped: false,
      elapsedMs: 1,
      mode: "lesson",
    }));
    expect((await page.request.post("/api/reviews/batch", { data: seeded })).ok()).toBe(true);

    const lesson = await sessionStarted(page, () => page.goto("/lesson"));
    expect(lesson.cards.filter((card) => card.kind === "reading")).toHaveLength(8);
    const wordIndex = lesson.cards.findIndex((card) => card.kind === "word");
    expect(wordIndex).toBe(4);
    for (const card of lesson.cards.slice(0, wordIndex)) {
      await page.keyboard.press(String(card.answerIndex + 1));
      await expect(page.locator(".quiz-card__glyph")).not.toHaveText(card.characterKey);
    }

    const word = lesson.cards[wordIndex];
    await expect(page.locator(".quiz-card__glyph")).toHaveText("學校");
    await expect(page.getByText("한자어 독음을 고르세요")).toBeVisible();
    await expect(page.locator('.quiz-card__sentence a[href*="oldid=4219407"]')).toBeVisible();
    const submission = page.waitForRequest((request) => request.url().endsWith("/api/reviews/batch") && (request.postDataJSON() as Array<{ wordId?: number }>).some((answer) => answer.wordId === word.wordId));
    const clockStart = Date.now();
    await page.clock.install({ time: clockStart });
    await page.clock.pauseAt(clockStart + 1_000);
    await page.keyboard.press(String(word.answerIndex + 1));
    expect((await submission).postDataJSON()).toEqual(expect.arrayContaining([expect.objectContaining({ characterKey: "學", wordId: word.wordId, correct: true })]));
    const celebration = page.locator(".celebration-layer");
    await expect(celebration).toHaveAttribute("aria-hidden", "true");
    await expect(celebration.locator(".particle-burst").last()).toBeAttached();
    await page.clock.runFor(249);
    await expect(page.locator(".quiz-card__glyph")).toHaveText("學校");
    await page.clock.runFor(1);
    await expect(page.locator(".quiz-card__glyph")).not.toHaveText("學校");
    await page.clock.resume();
    await finishSession(page, lesson.cards.slice(wordIndex + 1), /세션 완료/u, { autoAdvance: true, progressOffset: wordIndex + 1 });
    await page.keyboard.press("Enter");
    await expect(page.locator(".home-screen")).toBeVisible();
    expect((await page.request.patch("/api/settings", { data: { enabledTracks: ["kr", "cn"] } })).ok()).toBe(true);
  });

  test("path detail opens and exits by keyboard", async ({ page }, testInfo) => {
    await page.goto("/home");
    await expect(page.locator(".path-node").first()).toBeVisible();
    await expectClosestLang(page.locator(".path-node__glyph").first(), languages.kr);
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".path-node__glyph").first()).toHaveAttribute("lang", languages.cn);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("D");
    await expect(page.locator(".detail-screen")).toBeVisible();
    expect((await page.request.patch("/api/settings", { data: { enabledTracks: ["kr", "jp", "cn"] } })).ok()).toBe(true);
    await page.goto("/detail/%E4%B9%9D");
    await expect(page.locator('.track-panel[lang="ko"]')).toHaveCount(1);
    await expect(page.locator('.track-panel[lang="ja"]')).toHaveCount(1);
    await expect(page.locator('.track-panel[lang="zh-Hans"]')).toHaveCount(1);
    await expectClosestLang(page.locator('.track-panel[lang="zh-Hans"] .track-panel__sentence small').first(), languages.kr);
    await checkLayout(page, "detail", testInfo);
    expect((await page.request.patch("/api/settings", { data: { enabledTracks: ["kr", "cn"] } })).ok()).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.locator(".home-screen")).toBeVisible();
  });

  test("stats and settings persist keyboard changes", async ({ page }, testInfo) => {
    await page.goto("/home");
    await expect(page.getByRole("button", { name: /레슨 시작/u })).toBeVisible();
    await page.keyboard.press("T");
    await expect(page.getByRole("heading", { name: "통계" })).toBeVisible();
    await checkLayout(page, "stats", testInfo);
    await page.keyboard.press(",");
    await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
    await checkLayout(page, "settings", testInfo);

    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).not.toBe("none");
    await page.keyboard.press("Space");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /가타카나.*イチ・イツ/u })).toBeFocused();
    await page.keyboard.press("Tab");
    const scriptPersisted = page.waitForResponse((response) => response.url().endsWith("/api/settings") && response.request().method() === "PATCH" && response.ok());
    await page.keyboard.press("Space");
    await scriptPersisted;
    await expect(page.getByRole("button", { name: /히라가나.*いち・いつ/u })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Tab");
    const goal = page.getByRole("slider", { name: "일일 XP 목표" });
    const previous = Number(await goal.inputValue());
    const persisted = page.waitForResponse((response) => response.url().endsWith("/api/settings") && response.request().method() === "PATCH" && response.ok());
    await page.keyboard.press("ArrowRight");
    await expect(goal).toHaveValue(String(previous + 10));
    await persisted;
    await page.reload();
    await expect(page.locator(".track-toggles").getByRole("button", { name: /한자 · 급수/u })).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("button", { name: /히라가나.*いち・いつ/u })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("slider", { name: "일일 XP 목표" })).toHaveValue(String(previous + 10));
  });

  test("retakes placement for one curriculum and returns to settings", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
    const launch = page.locator(".placement-retest").getByRole("button", { name: /漢字 · 漢検.*15문항/u });
    await expect(launch).toHaveCount(0);
    const enabledBefore = await page.locator(".placement-retest").getByRole("button").count();
    await page.locator(".track-toggles").getByRole("button", { name: /漢字 · 漢検/u }).click();
    await expect(page.locator(".placement-retest").getByRole("button")).toHaveCount(enabledBefore + 1);
    const startRequest = page.waitForRequest((request) => request.url().endsWith("/api/session/start"));
    const first = await sessionStarted(page, () => launch.click());
    expect((await startRequest).postDataJSON()).toMatchObject({ mode: "placement", tracks: ["jp"], limit: 15 });
    expect(first.cards).toHaveLength(15);
    expect(first.cards.every((card) => card.track === "jp")).toBe(true);
    expect([...new Set(first.cards.map((card) => card.levelOrd))].sort()).toEqual([1, 2]);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Q");
    await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();

    const second = await sessionStarted(page, () => launch.click());
    const scoreRequest = page.waitForRequest((request) => request.url().endsWith("/api/placement/score"));
    const timing = await finishSession(page, second.cards, /현재 콘텐츠의 끝/u, { autoAdvance: true, measureCorrectLatency: true, verifyCelebration: true });
    expect(timing.correctTransitions).toBe(second.cards.length - 1);
    expect(timing.correctAdvanceMs).toBeLessThanOrEqual(timing.correctTransitions * MAIN_CORRECT_ADVANCE_BASELINE_MS * 1.1);
    expect(((await scoreRequest).postDataJSON() as { answers: Array<{ track: string }> }).answers.every((answer) => answer.track === "jp")).toBe(true);
    await expect(page.locator(".placement-result__card")).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
  });

  test("quit persists an answer and reopening starts on another card", async ({ page }) => {
    await page.goto("/home");
    await expect(page.getByRole("button", { name: /레슨 시작/u })).toBeVisible();
    const first = await sessionStarted(page, () => page.keyboard.press("Enter"));
    let failOnce = true;
    await page.route("**/api/reviews/batch", async (route) => {
      if (failOnce) {
        failOnce = false;
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "temporary" } }) });
      } else await route.continue();
    });
    await page.keyboard.press(String(first.cards[0].answerIndex + 1));
    await expect(page.getByRole("button", { name: /저장 재시도/u })).toBeVisible();
    await page.unroute("**/api/reviews/batch");
    await expect(page.getByRole("button", { name: /저장 재시도/u })).toBeHidden({ timeout: 5_000 });
    await page.keyboard.press("Escape");
    await page.keyboard.press("Q");
    await expect(page.locator(".home-screen")).toBeVisible();
    await expect(page.getByRole("button", { name: /레슨 시작/u })).toBeVisible();
    const reopened = await sessionStarted(page, () => page.keyboard.press("Enter"));
    expect(`${reopened.cards[0].characterKey}:${reopened.cards[0].track}`).not.toBe(`${first.cards[0].characterKey}:${first.cards[0].track}`);
  });
});
