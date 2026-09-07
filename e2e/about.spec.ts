import { expect, test } from "@playwright/test";

test("about page is reachable by keyboard from settings, explains coverage, and makes no writes", async ({ page }) => {
  const unexpectedWrites: Array<{ method: string; url: string }> = [];
  page.on("request", (request) => {
    const method = request.method();
    if (method !== "GET") unexpectedWrites.push({ method, url: request.url() });
  });

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();

  const aboutLink = page.getByRole("button", { name: "이 앱에 대해" });
  await aboutLink.focus();
  await expect(aboutLink).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { level: 1, name: "이 앱에 대해" })).toBeVisible();
  for (const heading of ["이 앱이 하는 일", "시험 척도 안내", "복습이 잡히는 방식 (FSRS)", "비교 카드와 말하기 연습", "데이터 출처와 라이선스"]) {
    await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
  }

  await expect(page.getByRole("cell", { name: "1,000자" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "2,211자" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "655자" })).toBeVisible();
  await expect(page.getByRole("link", { name: /profesorm\/hsk30/u })).toHaveAttribute("href", /github\.com\/profesorm\/hsk30/u);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.getByRole("button", { name: "← 설정으로" }).click();
  await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();

  expect(unexpectedWrites).toEqual([]);
});
