import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function resetProfile(onboarded: boolean) {
  execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--file", "e2e/reset.sql"], { cwd: process.cwd(), stdio: "pipe" });
  if (onboarded) execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--command", "UPDATE profile SET onboarded_at = 1 WHERE id = 1"], { cwd: process.cwd(), stdio: "pipe" });
}

async function sessionId(response: Awaited<ReturnType<Page["waitForResponse"]>>): Promise<string> {
  return (await response.json() as { sessionId: string }).sessionId;
}

test.beforeEach(() => resetProfile(true));
test.afterEach(() => resetProfile(false));

test("preview defers session creation and back-forward loads fresh data", async ({ page }) => {
  const starts: string[][] = [];
  let dueRequests = 0;
  let curriculumRequests = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/session/start") starts.push((request.postDataJSON() as { tracks: string[] }).tracks);
    if (url.pathname === "/api/reviews/due") {
      dueRequests += 1;
      expect(url.searchParams.get("tracks")).toBe("kr,jp,cn");
    }
    if (url.pathname === "/api/curriculum") curriculumRequests += 1;
  });

  await page.goto("/review");
  await expect(page.getByRole("button", { name: /복습 시작/u })).toBeVisible();
  expect(starts).toHaveLength(0);
  expect(dueRequests).toBe(1);
  expect(curriculumRequests).toBe(1);

  const firstResponse = page.waitForResponse((response) => response.url().endsWith("/api/session/start") && response.ok());
  await page.keyboard.press("Enter");
  const firstId = await sessionId(await firstResponse);
  await expect(page.getByRole("progressbar", { name: /진행률/u })).toBeVisible();
  expect(starts).toEqual([["kr", "jp", "cn"]]);
  expect(dueRequests).toBe(1);
  expect(curriculumRequests).toBe(1);

  const refreshedDue = page.waitForResponse((response) => response.url().includes("/api/reviews/due?") && response.ok());
  await page.goBack();
  await refreshedDue;
  await expect(page.getByRole("button", { name: /복습 시작/u })).toBeVisible();
  expect(starts).toHaveLength(1);
  expect(dueRequests).toBe(2);
  expect(curriculumRequests).toBe(2);

  let releaseSecond!: () => void;
  const holdSecond = new Promise<void>((resolve) => { releaseSecond = resolve; });
  await page.route("**/api/session/start", async (route) => {
    await holdSecond;
    await route.continue();
  }, { times: 1 });
  const secondRequest = page.waitForRequest((request) => request.url().endsWith("/api/session/start"));
  await page.goForward();
  await secondRequest;
  await expect(page.getByText("복습 세션을 불러오는 중…")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: /진행률/u })).toHaveCount(0);
  const secondResponse = page.waitForResponse((response) => response.url().endsWith("/api/session/start") && response.ok());
  releaseSecond();
  const secondId = await sessionId(await secondResponse);
  await expect(page.getByRole("progressbar", { name: /진행률/u })).toBeVisible();
  expect(secondId).not.toBe(firstId);
  expect(starts).toEqual([["kr", "jp", "cn"], ["kr", "jp", "cn"]]);
  expect(dueRequests).toBe(2);
  expect(curriculumRequests).toBe(2);
});

test("direct session entry loads no preview data", async ({ page }) => {
  let starts = 0;
  let dueRequests = 0;
  let curriculumRequests = 0;
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/session/start") starts += 1;
    if (pathname === "/api/reviews/due") dueRequests += 1;
    if (pathname === "/api/curriculum") curriculumRequests += 1;
  });

  await page.goto("/review/session");
  await expect(page.getByRole("progressbar", { name: /진행률/u })).toBeVisible();
  expect(starts).toBe(1);
  expect(dueRequests).toBe(0);
  expect(curriculumRequests).toBe(0);
});

test("curriculum failure leaves due review available and retries independently", async ({ page }) => {
  let failCurriculum = true;
  let starts = 0;
  let curriculumRequests = 0;
  await page.route("**/api/curriculum?*", async (route) => {
    curriculumRequests += 1;
    if (failCurriculum) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "curriculum unavailable" } }) });
    } else {
      await route.continue();
    }
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/session/start") starts += 1;
  });

  await page.goto("/review");
  await expect(page.getByRole("button", { name: /복습 시작/u })).toBeVisible();
  await expect(page.locator(".level-review-picker")).toContainText("curriculum unavailable");
  expect(starts).toBe(0);

  failCurriculum = false;
  const retried = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/curriculum" && response.ok());
  await page.getByRole("button", { name: "이전 레벨 다시 시도" }).click();
  await retried;
  await expect(page.locator(".level-review-picker")).toHaveCount(0);
  expect(curriculumRequests).toBe(2);

  await page.getByRole("button", { name: /복습 시작/u }).click();
  await expect(page.getByRole("progressbar", { name: /진행률/u })).toBeVisible();
  expect(starts).toBe(1);
});
