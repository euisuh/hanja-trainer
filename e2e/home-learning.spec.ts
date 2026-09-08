import { expect, test } from "@playwright/test";

test("home Enter never launches stale or failed track data", async ({ page }) => {
  let starts = 0;
  page.on("request", (request) => { if (request.url().endsWith("/api/session/start")) starts += 1; });
  await page.goto("/home");
  await expect(page.locator(".lesson-cta")).toBeVisible();
  await expect(page.locator(".home-routine")).toContainText("복습에서는");

  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/curriculum?track=*", async (route) => {
    await gate;
    await route.continue();
  }, { times: 1 });
  await page.locator('.track-tab[aria-pressed="false"]').first().click();
  await expect(page.getByText("학습 지도를 불러오는 중…")).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/home$/u);
  expect(starts).toBe(0);
  release();
  await expect(page.locator(".lesson-cta")).toBeVisible();

  await page.route("**/api/curriculum?track=*", (route) => route.fulfill({ status: 500, body: "failed" }), { times: 1 });
  await page.locator('.track-tab[aria-pressed="false"]').first().click();
  await expect(page.getByRole("alert")).toContainText("학습 지도를 불러오지 못했습니다");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/home$/u);
  expect(starts).toBe(0);
});

test("home Enter starts a lesson when the due backlog is empty", async ({ page }) => {
  await page.route("**/api/reviews/due?*", (route) => route.fulfill({ json: { total: 0, cards: [] } }));
  await page.goto("/home");
  await expect(page.locator(".lesson-cta")).toContainText("현재 유닛 새 글자 학습");
  const start = page.waitForRequest((request) => request.url().endsWith("/api/session/start"));
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Enter");
  expect((await start).postDataJSON()).toMatchObject({ mode: "lesson" });
});

test("home Enter prioritizes a bounded review while retaining new lessons", async ({ page }) => {
  await page.route("**/api/reviews/due?*", (route) => route.fulfill({ json: { total: 21, cards: [] } }));
  await page.goto("/home");
  await expect(page.locator(".lesson-cta")).toContainText("만기 전체 21장 · 한자 문제 최대 20개 · 단어 문제 추가 가능");
  await expect(page.getByRole("button", { name: /레슨 시작/u })).toHaveCount(1);
  const start = page.waitForRequest((request) => request.url().endsWith("/api/session/start"));
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Enter");
  expect((await start).postDataJSON()).toMatchObject({ mode: "review", tracks: expect.any(Array), limit: 20 });
});
