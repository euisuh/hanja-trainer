import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

test.beforeEach(() => {
  execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--file", "e2e/reset.sql"], { cwd: process.cwd(), stdio: "pipe" });
  execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--command", "UPDATE profile SET onboarded_at = 1 WHERE id = 1"], { cwd: process.cwd(), stdio: "pipe" });
});

test("keeps an immediate field-only save alive across navigation", async ({ page }) => {
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let patchBody: unknown;
  let owner: string | null = null;
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() !== "PATCH") { await route.continue(); return; }
    patchBody = route.request().postDataJSON();
    owner = route.request().headers()["x-hanja-profile-id"] ?? null;
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });

  const goal = page.getByRole("slider", { name: "일일 XP 목표" });
  const nextGoal = Number(await goal.inputValue()) + 10;
  await goal.press("ArrowRight");
  await page.getByRole("button", { name: "이 앱에 대해" }).click();
  await expect(page.getByRole("heading", { name: "이 앱에 대해" })).toBeVisible();
  expect(patchBody).toEqual({ dailyGoal: nextGoal });
  expect(owner).toBe("1");
  release();
  await page.getByRole("button", { name: "← 설정으로" }).click();
  await expect(page.getByRole("slider", { name: "일일 XP 목표" })).toHaveValue(String(nextGoal));
});

test("serializes rapid edits and never sends a stale full snapshot", async ({ page }) => {
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const bodies: unknown[] = [];
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() !== "PATCH") { await route.continue(); return; }
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) await held;
    await route.continue();
  });

  const goal = page.getByRole("slider", { name: "일일 XP 목표" });
  const original = Number(await goal.inputValue());
  await goal.press("ArrowRight");
  await goal.press("ArrowRight");
  await page.getByRole("group", { name: "소리 피드백" }).getByRole("button", { name: "끄기" }).click();
  await expect.poll(() => bodies.length).toBe(1);
  release();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies).toEqual([{ dailyGoal: original + 10 }, { dailyGoal: original + 20, soundMode: "off" }]);
  await page.reload();
  await expect(page.getByRole("slider", { name: "일일 XP 목표" })).toHaveValue(String(original + 20));
  await expect(page.getByRole("group", { name: "소리 피드백" }).getByRole("button", { name: "끄기" })).toHaveAttribute("aria-pressed", "true");
});

test("shows a failed save and retries the same edit", async ({ page }) => {
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  let attempts = 0;
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() !== "PATCH") { await route.continue(); return; }
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "service_unavailable", message: "offline" } }) });
      return;
    }
    await route.continue();
  });

  await page.getByRole("group", { name: "소리 피드백" }).getByRole("button", { name: "끄기" }).click();
  await expect(page.getByRole("alert")).toContainText("offline");
  await page.getByRole("button", { name: "저장 다시 시도" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(attempts).toBe(2);
  await page.reload();
  await expect(page.getByRole("group", { name: "소리 피드백" }).getByRole("button", { name: "끄기" })).toHaveAttribute("aria-pressed", "true");
});

test("does not let the app's older settings load revert a saved theme", async ({ page }) => {
  let settingsGets = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() !== "GET") { await route.continue(); return; }
    settingsGets += 1;
    if (settingsGets !== 2) { await route.continue(); return; }
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
  const saved = page.waitForResponse((response) => response.url().endsWith("/api/settings") && response.request().method() === "PATCH" && response.ok());
  await page.getByRole("button", { name: "기본" }).click();
  await saved;
  await expect(page.locator(".app")).toHaveAttribute("data-theme", "default");
  release();
  await expect(page.locator(".app")).toHaveAttribute("data-theme", "default");
});

test("lets the app theme load finish after an unrelated settings event", async ({ page }) => {
  execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--command", "UPDATE profile SET theme = 'default' WHERE id = 1"], { cwd: process.cwd(), stdio: "pipe" });
  let settingsGets = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() !== "GET" || ++settingsGets !== 2) { await route.continue(); return; }
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
  const saved = page.waitForResponse((response) => response.url().endsWith("/api/settings") && response.request().method() === "PATCH" && response.ok());
  await page.getByRole("slider", { name: "일일 XP 목표" }).press("ArrowRight");
  await saved;
  release();
  await expect(page.locator(".app")).toHaveAttribute("data-theme", "default");
});
