import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function sql(command: string) {
  execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--command", command], { cwd: process.cwd(), stdio: "pipe" });
}

function resetProfile() {
  execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--file", "e2e/reset.sql"], { cwd: process.cwd(), stdio: "pipe" });
}

test.beforeEach(() => { resetProfile(); sql("UPDATE profile SET onboarded_at = 1 WHERE id = 1"); });
test.afterEach(resetProfile);

async function enableNotebook(page: Page) {
  const response = await page.request.patch("/api/settings", {
    headers: { "x-hanja-profile-id": "1" },
    data: { appearance: "notebook" },
  });
  expect(response.ok()).toBe(true);
  await page.reload();
  await expect(page.locator(".app")).toHaveAttribute("data-appearance", "notebook");
}

async function expectNarrowPage(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

test("notebook remaining reachable screens fit narrow viewport", async ({ page }) => {
  await page.goto("/settings");
  await enableNotebook(page);
  await page.setViewportSize({ width: 390, height: 844 });

  try {
    await expectNarrowPage(page, "/settings", "설정");
    await expectNarrowPage(page, "/about", "이 앱에 대해");
    await expectNarrowPage(page, "/stats", "통계");
    await page.goto("/detail/%E4%B9%9D");
    await expect(page.locator(".detail-screen")).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.goto("/home");
    await page.evaluate(() => {
      window.history.pushState({
        idx: (window.history.state?.idx ?? 0) + 1,
        key: "notebook-placement-result",
        usr: { results: [{ track: "kr", levelOrd: 1, levelBadge: "8급", knownCount: 0, totalSeen: 5, accuracy: 0, saturated: false, floored: true, detail: "0/5문항 정확 · 처음부터 시작" }] },
      }, "", "/placement-result");
      window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    });
    await expect(page.locator(".placement-result")).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.evaluate(() => {
      window.history.pushState({
        idx: (window.history.state?.idx ?? 0) + 1,
        key: "notebook-session-complete",
        usr: { xp: 0, accuracy: 100, bestCombo: 0, nextReview: "내일", answered: 1, correct: 1, skipped: 0 },
      }, "", "/session-complete");
      window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    });
    await expect(page.locator(".session-complete")).toBeVisible();
    await expectNoHorizontalScroll(page);

    sql("UPDATE profile SET onboarded_at = NULL WHERE id = 1");
    await expectNarrowPage(page, "/onboarding", "한 글자, 세 개의 시험.");
  } finally {
    const response = await page.request.patch("/api/settings", {
      headers: { "x-hanja-profile-id": "1" },
      data: { appearance: "classic" },
    });
    expect(response.ok()).toBe(true);
  }
});
