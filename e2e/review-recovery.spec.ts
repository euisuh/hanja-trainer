import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const storageKey = "hanja-trainer:pending-reviews";

test.afterEach(() => {
  execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--file", "e2e/reset.sql"], { cwd: process.cwd(), stdio: "pipe" });
});

test("shows, exports, and explicitly discards a rejected review on Home", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const malformed = { profileId: 1, input: { sessionId: "malformed" } };
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: JSON.stringify([malformed]) });

  await page.goto("/home");

  const status = page.getByRole("status");
  await expect(status).toContainText("저장하지 못한 학습 기록 1건");
  await expect(status.locator("code")).toHaveText("invalid_stored_review");
  await page.getByText("보관 기록 살펴보기").click();
  await expect(status.locator("pre")).toContainText('"sessionId": "malformed"');
  expect(await status.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null") as unknown, storageKey);
  expect(stored).toMatchObject({ version: 1, pending: [], rejected: [{ profileId: 1, raw: malformed, errorCode: "invalid_stored_review" }] });

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "기록 내보내기" }).click();
  expect((await download).suggestedFilename()).toBe("hanja-rejected-reviews-1.json");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "보관 기록 삭제" }).click();
  await expect(status).toHaveCount(0);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
});

test("recovers a pending review from Home when the browser comes online", async ({ page }) => {
  const review = {
    profileId: 1,
    input: { sessionId: "home-online", cardIndex: 0, characterKey: "一", track: "kr", correct: true, skipped: false, elapsedMs: 500, mode: "placement" },
  };
  await page.addInitScript(({ key, value }) => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    localStorage.setItem(key, value);
  }, { key: storageKey, value: JSON.stringify([review]) });
  const batches: unknown[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/reviews/batch")) batches.push(request.postDataJSON());
  });

  await page.goto("/home");
  await expect(page.getByRole("status")).toContainText("학습 기록 1건");
  expect(batches).toHaveLength(0);

  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    window.dispatchEvent(new Event("online"));
  });

  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
  expect(batches).toHaveLength(1);
  await expect(page.locator(".session-runner")).toHaveCount(0);
});

test("offers top-level re-authentication without losing pending records", async ({ page }) => {
  const pending = [{
    profileId: 1,
    input: { sessionId: "preserved", cardIndex: 0, characterKey: "一", track: "kr", correct: true, skipped: false, elapsedMs: 500, mode: "placement" },
  }];
  await page.addInitScript(({ key, value }) => {
    if (sessionStorage.getItem("review-recovery-seeded")) return;
    localStorage.setItem(key, value);
    sessionStorage.setItem("review-recovery-seeded", "true");
  }, { key: storageKey, value: JSON.stringify(pending) });
  await page.route("**/api/profiles", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<html>Access login</html>" }));

  await page.goto("/home");
  await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
  const navigation = page.waitForNavigation();
  await page.getByRole("button", { name: "로그인 페이지 다시 열기" }).click();
  await navigation;

  await expect(page.getByRole("button", { name: "로그인 페이지 다시 열기" })).toBeVisible();
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null") as { pending: unknown[] }, storageKey);
  expect(stored.pending).toEqual(pending);
});
