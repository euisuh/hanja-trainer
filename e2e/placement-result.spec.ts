import { expect, test, type Page } from "@playwright/test";

const result = {
  results: [
    { track: "kr", levelOrd: 1, levelBadge: "8급", knownCount: 0, totalSeen: 5, accuracy: 0, saturated: false, floored: true, detail: "0/5문항 정확 · 처음부터 시작" },
    { track: "jp", levelOrd: 1, levelBadge: "N5", knownCount: 0, totalSeen: 5, accuracy: 0, saturated: false, floored: true, detail: "0/5문항 정확 · 처음부터 시작" },
    { track: "cn", levelOrd: 1, levelBadge: "HSK 1", knownCount: 0, totalSeen: 5, accuracy: 0, saturated: false, floored: true, detail: "0/5문항 정확 · 처음부터 시작" },
  ],
};

async function openResult(page: Page) {
  await page.goto("/home");
  await page.evaluate((state) => {
    window.history.pushState({ idx: (window.history.state?.idx ?? 0) + 1, key: "placement-result-test", usr: state }, "", "/placement-result");
    window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
  }, result);
  await expect(page.locator(".placement-result")).toBeVisible();
}

test("placement results reveal levels progressively and respect reduced motion", async ({ page }) => {
  await openResult(page);
  await expect(page.getByRole("heading", { name: "여기서 시작해요!" })).toBeVisible();
  await expect(page.locator(".placement-result__card strong")).toHaveText(["8급", "N5", "HSK 1"]);
  await expect(page.locator(".placement-result__card > span:last-child")).toHaveText([
    "0/5문항 정확 · 기초부터 차근차근",
    "0/5문항 정확 · 기초부터 차근차근",
    "0/5문항 정확 · 기초부터 차근차근",
  ]);
  await expect(page.locator(".placement-result")).not.toContainText("처음부터 시작");
  expect(await page.locator(".placement-result__card").evaluateAll((cards) => cards.map((card) => {
    const style = getComputedStyle(card);
    return [style.animationName, style.animationDelay];
  }))).toEqual([["om-pop", "0.18s"], ["om-pop", "0.32s"], ["om-pop", "0.46s"]]);
  expect(await page.locator(".placement-result__card span em").evaluateAll((figures) => figures.map((figure) => {
    const style = getComputedStyle(figure);
    return [style.animationName, style.animationDelay];
  }))).toEqual([["om-count-up", "0.38s"], ["om-count-up", "0.52s"], ["om-count-up", "0.66s"]]);
  await expect(page.locator(".placement-result__cta")).toHaveCSS("animation-delay", "0.74s");
  expect(await page.locator(".placement-result__badge").evaluateAll((badges) => badges.every((badge) => {
    const card = badge.closest(".placement-result__card")!;
    const style = getComputedStyle(badge);
    return style.width === "44px" && style.height === "44px" && style.backgroundColor === getComputedStyle(card).borderColor;
  }))).toBe(true);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await openResult(page);
  for (const selector of [".placement-result h1", ".placement-result__card", ".placement-result__cta", ".placement-result__card span em"]) {
    await expect(page.locator(selector).first()).toHaveCSS("animation-name", "none");
    await expect(page.locator(selector).first()).toBeVisible();
  }
});
