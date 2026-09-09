import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function resetProfile() {
  execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--file", "e2e/reset.sql"], { cwd: process.cwd(), stdio: "pipe" });
  execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--command", "UPDATE profile SET onboarded_at = 1, enabled_tracks = '[\"cn\"]' WHERE id = 1"], { cwd: process.cwd(), stdio: "pipe" });
}

test.beforeEach(() => resetProfile());
test.afterEach(() => resetProfile());

test("Chinese meaning choices and feedback use the Chinese definition", async ({ page }) => {
  await page.route("**/api/session/start", (route) => route.fulfill({ json: {
    sessionId: "cn-meaning-fixture",
    cards: [{
      kind: "meaning",
      characterKey: "吃",
      meaningKo: "말 더듬을",
      meaning: "eat",
      reading: "chī",
      track: "cn",
      glyph: "吃",
      levelBadge: "HSK 1 · 一级字",
      levelOrd: 1,
      trackBadge: "中国 · 简体",
      prompt: "选择正确的意思",
      sentence: null,
      options: [{ label: "finish" }, { label: "target" }, { label: "eat" }, { label: "stutter" }],
      answerIndex: 2,
    }],
  } }));
  await page.route("**/api/reviews/batch", (route) => route.fulfill({ json: { results: [{
    due: "2026-09-10T00:00:00.000Z",
    scheduledDays: 1,
    stability: 1,
    difficulty: 5,
    dueLabel: "1일 후",
  }] } }));

  await page.goto("/review/session");
  await expect(page.locator(".quiz-card")).toBeFocused();
  await expect(page.getByText("말 더듬을", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "보기로 풀기" }).click();
  expect(await page.locator(".answer-option strong").evaluateAll((options) => options.map((option) => option.lang))).toEqual(["en", "en", "en", "en"]);
  await page.locator(".answer-option").first().click();
  await expect(page.locator('.feedback-bar [lang="en"]')).toHaveText("eat");
  await expect(page.locator(".feedback-bar")).not.toContainText("말 더듬을");
  await expect(page.getByRole("button", { name: /저장 재시도/u })).toHaveCount(0);
});
