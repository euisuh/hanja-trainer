import { expect, test } from "@playwright/test";

test("about page is reachable by keyboard from settings, explains coverage, and makes no writes", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
  // A brand-new profile's first settings load fires a one-time timezone
  // PATCH (see useSettings.ts) unrelated to this page. Let that settle
  // before recording writes, so this only asserts on writes the about
  // page itself (or navigating to/from it) causes.
  await page.waitForLoadState("networkidle");

  const unexpectedWrites: Array<{ method: string; url: string }> = [];
  page.on("request", (request) => {
    const method = request.method();
    if (method !== "GET") unexpectedWrites.push({ method, url: request.url() });
  });

  const aboutLink = page.getByRole("button", { name: "이 앱에 대해" });
  await aboutLink.focus();
  await expect(aboutLink).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { level: 1, name: "이 앱에 대해" })).toBeVisible();
  for (const heading of ["이 앱이 하는 일", "시험 척도 안내", "복습이 잡히는 방식 (FSRS)", "효과적으로 연습하는 법", "비교 카드와 말하기 연습", "데이터 출처와 라이선스"]) {
    await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
  }

  await expect(page.getByRole("cell", { name: "1,000자" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "2,211자" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "655자" })).toBeVisible();
  await expect(page.getByRole("link", { name: /profesorm\/hsk30/u })).toHaveAttribute("href", /github\.com\/profesorm\/hsk30/u);
  await expect(page.getByRole("link", { name: /Karpicke/u })).toHaveAttribute("href", "https://doi.org/10.1126/science.1152408");
  await expect(page.getByText(/제품상 휴리스틱/u)).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.getByRole("button", { name: "← 설정으로" }).click();
  await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();

  await page.goto("/home");
  await page.getByRole("link", { name: "학습 방법과 근거" }).click();
  await expect(page).toHaveURL(/\/about#learning-method$/u);
  await expect(page.locator("#learning-method")).toBeFocused();
  await expect(page.getByRole("heading", { name: "효과적으로 연습하는 법" })).toBeInViewport();

  expect(unexpectedWrites).toEqual([]);
});
