import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const languages = { kr: "ko", jp: "ja", cn: "zh-Hans" } as const;
type Card = { answerIndex: number; characterKey: string; kind: "compare" | "reading"; levelOrd: number; options: Array<{ label: string }>; track: keyof typeof languages };
type SessionResponse = { cards: Card[] };
const NUDGE_SNOOZES_KEY = "hanja-trainer:track-imbalance-snoozes";

async function expectClosestLang(locator: Locator, lang: string) {
  expect(await locator.evaluate((node) => node.closest("[lang]")?.getAttribute("lang"))).toBe(lang);
}

async function sessionStarted(page: Page, action: () => Promise<void>): Promise<SessionResponse> {
  const response = page.waitForResponse((candidate) => candidate.url().endsWith("/api/session/start") && candidate.ok());
  await action();
  return await (await response).json() as SessionResponse;
}

type FinishOptions = { progressOffset?: number; skipFirst?: boolean; verifyLanguages?: boolean };

async function finishSession(page: Page, cards: Card[], completion = /세션 완료/u, options: FinishOptions = {}) {
  let skipped = false;
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    if (options.verifyLanguages) {
      await expectClosestLang(page.locator(".quiz-card__glyph"), languages[card.track]);
      if (card.kind === "reading") {
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
    if (card.kind === "reading") {
      const shouldSkip = Boolean(options.skipFirst) && !skipped;
      await page.keyboard.press(shouldSkip ? "0" : String(card.answerIndex + 1));
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
    await page.keyboard.press("Enter");
    if (index + 1 < cards.length) {
      const completed = (options.progressOffset ?? 0) + cards.slice(0, index + 1).filter((item) => item.kind === "reading").length;
      const next = cards[index + 1];
      await expect(page.getByRole("progressbar", { name: /진행률/u })).toHaveAttribute("aria-valuenow", String(completed + Number(next.kind === "reading")));
    }
  }
  await expect(page.getByRole("heading", { name: completion })).toBeVisible();
}

function expectReadingOnly(cards: Card[]) {
  for (const card of cards.filter((item) => item.kind === "reading")) {
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
    await finishSession(page, placement.cards, /시작 지점/u);
    await expect(page.getByRole("heading", { name: "시작 지점이 정해졌습니다." })).toBeVisible();
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

    await expectClosestLang(page.locator(".quiz-card__glyph"), languages[lesson.cards[0].track]);
    await expectClosestLang(page.locator(".answer-option__copy strong").first(), languages[lesson.cards[0].track]);
    const clickedAnswer = page.locator(".answer-option").nth(1);
    await clickedAnswer.click();
    await expect(clickedAnswer).toBeFocused();
    await expect(clickedAnswer).toHaveAttribute("aria-disabled", "true");
    await clickedAnswer.press("Enter");
    await expect(page.getByRole("progressbar", { name: /진행률/u })).toHaveAttribute("aria-valuenow", "1");
    const sourceLink = page.locator(".quiz-card__sentence a").first();
    await sourceLink.evaluate((link) => link.addEventListener("click", (event) => {
      event.preventDefault();
      link.setAttribute("data-keyboard-activated", "true");
    }, { once: true }));
    await sourceLink.press("Enter");
    await expect(sourceLink).toHaveAttribute("data-keyboard-activated", "true");
    await sourceLink.press("Space");
    await expect(page.getByRole("progressbar", { name: /진행률/u })).toHaveAttribute("aria-valuenow", "1");
    await clickedAnswer.focus();
    await clickedAnswer.press("Shift+Tab");
    await expect(page.locator(".answer-option").first()).toBeFocused();
    await page.getByRole("button", { name: /다음 카드/u }).click();

    await finishSession(page, lesson.cards.slice(1), /세션 완료/u, { progressOffset: 1, skipFirst: true, verifyLanguages: true });
    await expect.poll(async () => (await (await page.request.get("/api/stats")).json() as { skipped: number }).skipped).toBeGreaterThan(0);
    await checkLayout(page, "session-complete", testInfo);
    await page.keyboard.press("Enter");
    await expect(page.locator(".home-screen")).toBeVisible();
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
    await finishSession(page, review.cards);
    await page.keyboard.press("Enter");
    await expect(page.locator(".home-screen")).toBeVisible();
    await expect.poll(async () => {
      const after = await page.request.get("/api/reviews/due?tracks=kr,cn&limit=100");
      return (await after.json() as { total: number }).total;
    }).toBe(0);
    await page.keyboard.press("R");
    await expect(page.getByText("오늘 복습할 카드가 없습니다")).toBeVisible();
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
    await finishSession(page, second.cards, /시작 지점/u);
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
