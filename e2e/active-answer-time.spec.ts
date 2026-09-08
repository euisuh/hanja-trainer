import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

type Card = { answerIndex: number; kind: string };
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function resetProfile(onboarded: boolean) {
  execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--file", "e2e/reset.sql"], { cwd: process.cwd(), stdio: "pipe" });
  if (onboarded) execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--command", "UPDATE profile SET onboarded_at = 1 WHERE id = 1"], { cwd: process.cwd(), stdio: "pipe" });
}

async function startAnswerableCard(page: Page): Promise<Card> {
  const started = page.waitForResponse((response) => response.url().endsWith("/api/session/start") && response.ok());
  await page.goto("/lesson");
  const { cards } = await (await started).json() as { cards: Card[] };
  let index = 0;
  while (cards[index]?.kind === "compare") {
    await page.keyboard.press("Enter");
    index += 1;
  }
  await expect(page.locator(".answer-option").first()).toBeVisible();
  return cards[index];
}

async function setVisibility(page: Page, state: "hidden" | "visible") {
  await page.evaluate((visibilityState) => {
    Object.defineProperties(document, {
      hidden: { configurable: true, value: visibilityState === "hidden" },
      visibilityState: { configurable: true, value: visibilityState },
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

test.beforeEach(() => resetProfile(true));
test.afterEach(() => resetProfile(false));

test("submits only active time across multiple pause cycles", async ({ page }) => {
  const start = new Date("2026-01-01T00:00:00.000Z");
  await page.clock.install({ time: start });
  await page.clock.pauseAt(start);
  const card = await startAnswerableCard(page);

  await page.clock.runFor(1_000);
  await page.getByRole("button", { name: "세션 일시정지" }).click();
  await page.clock.runFor(30_000);
  await page.keyboard.press("Escape");
  await page.clock.runFor(500);
  await page.keyboard.press("Escape");
  await page.clock.runFor(3_600_001);
  await page.getByRole("button", { name: /계속하기/u }).click();
  await page.clock.runFor(500);

  let submissionCount = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/reviews/batch") && request.method() === "POST") submissionCount += 1;
  });
  const submitted = page.waitForRequest((request) => request.url().endsWith("/api/reviews/batch") && request.method() === "POST");
  await page.evaluate((key) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
    window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
  }, String(card.answerIndex + 1));
  const request = await submitted;
  expect(request.postDataJSON()).toEqual(expect.arrayContaining([
    expect.objectContaining({ correct: true, elapsedMs: 2_000 }),
  ]));
  await request.response();
  expect(submissionCount).toBe(1);
});

test("hidden tabs pause timing and pending auto-advance", async ({ page }) => {
  const start = new Date("2026-01-01T00:00:00.000Z");
  await page.clock.install({ time: start });
  await page.clock.pauseAt(start);
  const card = await startAnswerableCard(page);

  await page.clock.runFor(1_000);
  await setVisibility(page, "hidden");
  await expect(page.getByRole("dialog", { name: "일시정지" })).toBeVisible();
  await page.clock.runFor(3_600_001);
  await setVisibility(page, "visible");
  await expect(page.getByRole("dialog", { name: "일시정지" })).toBeVisible();
  await expect(page.locator(".answer-option").first()).toHaveAttribute("aria-disabled", "false");
  await page.getByRole("button", { name: /계속하기/u }).click();
  await page.clock.runFor(1_000);

  const submitted = page.waitForRequest((request) => request.url().endsWith("/api/reviews/batch") && request.method() === "POST");
  await page.keyboard.press(String(card.answerIndex + 1));
  expect((await submitted).postDataJSON()).toEqual(expect.arrayContaining([
    expect.objectContaining({ correct: true, elapsedMs: 2_000 }),
  ]));

  await page.locator(".session-card-wrap").evaluate((node) => node.setAttribute("data-paused-card", "true"));
  await setVisibility(page, "hidden");
  await page.clock.runFor(5_000);
  await setVisibility(page, "visible");
  await expect(page.getByRole("dialog", { name: "일시정지" })).toBeVisible();
  await expect(page.locator('[data-paused-card="true"]')).toBeVisible();
  await page.getByRole("button", { name: /계속하기/u }).click();
  await page.clock.runFor(899);
  await expect(page.locator('[data-paused-card="true"]')).toBeVisible();
  await page.clock.runFor(1);
  await expect(page.locator('[data-paused-card="true"]')).toHaveCount(0);
});

test("caps submitted active time at the API limit", async ({ page }) => {
  const start = new Date("2026-01-01T00:00:00.000Z");
  await page.clock.install({ time: start });
  await page.clock.pauseAt(start);
  const card = await startAnswerableCard(page);
  await page.clock.runFor(3_600_001);

  const submitted = page.waitForRequest((request) => request.url().endsWith("/api/reviews/batch") && request.method() === "POST");
  await page.keyboard.press(String(card.answerIndex + 1));
  expect((await submitted).postDataJSON()).toEqual(expect.arrayContaining([
    expect.objectContaining({ correct: true, elapsedMs: 3_600_000 }),
  ]));
});

test("an initially hidden card stays paused until explicit resume", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperties(document, {
      hidden: { configurable: true, value: true },
      visibilityState: { configurable: true, value: "hidden" },
    });
  });
  const start = new Date("2026-01-01T00:00:00.000Z");
  await page.clock.install({ time: start });
  await page.clock.pauseAt(start);
  const card = await startAnswerableCard(page);
  await expect(page.getByRole("dialog", { name: "일시정지" })).toBeVisible();
  await page.clock.runFor(3_600_001);
  await setVisibility(page, "visible");
  await expect(page.getByRole("dialog", { name: "일시정지" })).toBeVisible();
  await page.getByRole("button", { name: /계속하기/u }).click();
  await page.clock.runFor(1_000);

  const submitted = page.waitForRequest((request) => request.url().endsWith("/api/reviews/batch") && request.method() === "POST");
  await page.keyboard.press(String(card.answerIndex + 1));
  expect((await submitted).postDataJSON()).toEqual(expect.arrayContaining([
    expect.objectContaining({ correct: true, elapsedMs: 1_000 }),
  ]));
});
