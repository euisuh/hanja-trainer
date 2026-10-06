import { expect, test } from "@playwright/test";

test("JP Home shows a Talk banner and the bottom nav links to Talk", async ({ page }, testInfo) => {
  await page.goto("/home");
  await expect(page.locator(".lesson-cta")).toBeVisible();
  await page.locator(".track-tab", { hasText: "급수" }).click();
  await expect(page.locator(".track-tab", { hasText: "급수" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".talk-banner")).toBeHidden();

  await page.locator(".track-tab", { hasText: "JLPT" }).first().click();
  const banner = page.getByRole("button", { name: /일본어 회화 Talk/u });
  await expect(banner).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("jp-home-talk-banner.png"), fullPage: true });
  await banner.click();
  await expect(page).toHaveURL(/\/talk$/u);

  await page.goto("/home");
  await expect(page.locator('.bottom-nav a[href="/talk"]')).toBeVisible();
  await page.locator('.bottom-nav a[href="/talk"]').click();
  await expect(page).toHaveURL(/\/talk$/u);
});
