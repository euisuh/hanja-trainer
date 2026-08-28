import { expect, test, type Page, type TestInfo } from "@playwright/test";

type Card = { answerIndex: number; characterKey: string; kind: "compare" | "reading"; track: string };
type SessionResponse = { cards: Card[] };

async function sessionStarted(page: Page, action: () => Promise<void>): Promise<SessionResponse> {
  const response = page.waitForResponse((candidate) => candidate.url().endsWith("/api/session/start") && candidate.ok());
  await action();
  return await (await response).json() as SessionResponse;
}

async function finishSession(page: Page, cards: Card[], completion = /세션 완료/u) {
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    if (card.kind === "reading") await page.keyboard.press(String(card.answerIndex + 1));
    await page.keyboard.press("Enter");
    if (index + 1 < cards.length) {
      await expect(page.getByRole("progressbar", { name: /진행률/u })).toHaveAttribute("aria-valuenow", String(index + 2));
    }
  }
  await expect(page.getByRole("heading", { name: completion })).toBeVisible();
}

async function checkLayout(page: Page, name: string, testInfo: TestInfo) {
  for (const width of [430, 1080]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ fullPage: true, path: testInfo.outputPath(`${name}-${width}.png`) });
  }
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
    const placement = await sessionStarted(page, () => page.keyboard.press("Enter"));
    expect(placement.cards).toHaveLength(15);
    await expect(page.getByRole("progressbar", { name: /진행률/u })).toBeVisible();
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
    const lesson = await sessionStarted(page, () => page.keyboard.press("Enter"));
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

    await finishSession(page, lesson.cards);
    await checkLayout(page, "session-complete", testInfo);
    await page.keyboard.press("Enter");
    await expect(page.locator(".home-screen")).toBeVisible();
  });

  test("review queue decreases and reaches its empty state", async ({ page }, testInfo) => {
    await page.goto("/home");
    const review = await sessionStarted(page, () => page.keyboard.press("R"));
    const before = await page.request.get("/api/reviews/due?tracks=kr,cn&limit=100");
    const beforeTotal = (await before.json() as { total: number }).total;
    expect(beforeTotal).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: /복습 시작/u })).toBeVisible();
    await checkLayout(page, "review", testInfo);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("progressbar", { name: /진행률/u })).toBeVisible();
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
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("D");
    await expect(page.locator(".detail-screen")).toBeVisible();
    await expect(page.getByText(/복습 기록이 없습니다/u).first()).toBeVisible();
    await checkLayout(page, "detail", testInfo);
    await page.keyboard.press("Escape");
    await expect(page.locator(".home-screen")).toBeVisible();
  });

  test("stats and settings persist keyboard changes", async ({ page }, testInfo) => {
    await page.goto("/home");
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
    const goal = page.getByRole("slider", { name: "일일 XP 목표" });
    const previous = Number(await goal.inputValue());
    const persisted = page.waitForResponse((response) => response.url().endsWith("/api/settings") && response.request().method() === "PATCH" && response.ok());
    await page.keyboard.press("ArrowRight");
    await expect(goal).toHaveValue(String(previous + 10));
    await persisted;
    await page.reload();
    await expect(page.getByRole("button", { name: /한자 · 급수/u })).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("slider", { name: "일일 XP 목표" })).toHaveValue(String(previous + 10));
  });

  test("quit persists an answer and reopening starts on another card", async ({ page }) => {
    await page.goto("/home");
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
    const reopened = await sessionStarted(page, () => page.keyboard.press("Enter"));
    expect(`${reopened.cards[0].characterKey}:${reopened.cards[0].track}`).not.toBe(`${first.cards[0].characterKey}:${first.cards[0].track}`);
  });
});
