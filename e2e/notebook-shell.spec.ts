import { expect, test } from "@playwright/test";

test("Notebook shell is flat without changing classic", async ({ page }) => {
  const settings = { headers: { "x-hanja-profile-id": "1" } };
  expect((await page.request.patch("/api/settings", { ...settings, data: { appearance: "classic" } })).ok()).toBe(true);

  await page.goto("/home");
  const classic = await page.locator(".lesson-cta").evaluate((element) => ({
    radius: getComputedStyle(element).borderRadius,
    shadow: getComputedStyle(element).boxShadow,
  }));

  try {
    expect((await page.request.patch("/api/settings", { ...settings, data: { appearance: "notebook" } })).ok()).toBe(true);
    await page.reload();

    await expect(page.locator(".lesson-cta")).toHaveCSS("box-shadow", "none");
    await expect(page.locator(".review-cta")).toHaveCSS("box-shadow", "none");
    await expect(page.locator(".lesson-cta")).toHaveCSS("border-radius", "3px");
    await expect(page.locator('.bottom-nav a[href="/talk"]')).toHaveCSS("font-family", /Plex Mono/u);
  } finally {
    expect((await page.request.patch("/api/settings", { ...settings, data: { appearance: "classic" } })).ok()).toBe(true);
    await page.reload();
  }

  await expect(page.locator(".lesson-cta")).toHaveCSS("border-radius", classic.radius);
  await expect(page.locator(".lesson-cta")).toHaveCSS("box-shadow", classic.shadow);
});
