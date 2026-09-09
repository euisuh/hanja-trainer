import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function resetProfile() {
  execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--file", "e2e/reset.sql"], { cwd: process.cwd(), stdio: "pipe" });
  execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--command", "UPDATE profile SET onboarded_at = 1, enabled_tracks = '[\"cn\"]' WHERE id = 1"], { cwd: process.cwd(), stdio: "pipe" });
}

test.beforeEach(() => resetProfile());
test.afterEach(() => resetProfile());

test("Chinese study and detail views show the Chinese definition", async ({ page }) => {
  const curriculum = await (await page.request.get("/api/curriculum?track=cn")).json() as { units: Array<{ id: number; nodes: Array<{ key: string }> }> };
  const unit = curriculum.units.find((candidate) => candidate.nodes.some(({ key }) => key === "吃"));
  expect(unit).toBeDefined();

  await page.goto(`/study/${unit!.id}`);
  const row = page.locator(".unit-study__table tbody tr").filter({ hasText: "吃" });
  await expect(row.locator(".unit-study__glyph small")).toHaveText("eat");
  await expect(row.locator(".unit-study__meaning")).toHaveText("eat");
  await expect(row.locator('[lang="en"]')).toHaveCount(2);
  await expect(row).not.toContainText("말 더듬을");

  await page.goto(`/detail/${encodeURIComponent("吃")}`);
  const panel = page.locator(".track-panel").filter({ hasText: "中国" });
  await expect(panel.locator(".track-panel__meaning")).toHaveText("eat");
  await expect(panel.locator(".track-panel__meaning")).toHaveAttribute("lang", "en");
  await expect(page.locator(".detail-screen")).not.toContainText("말 더듬을");
});
