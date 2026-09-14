import { expect, test } from "@playwright/test";

test("privacy policy is public, self-contained, and linked from about", async ({ browser, page }) => {
  // A fresh context has no profile session: store reviewers and testers open it the same way.
  const visitor = await browser.newContext();
  const policy = await visitor.newPage();
  const offOrigin: string[] = [];
  policy.on("request", (request) => { if (!request.url().startsWith("http://127.0.0.1")) offOrigin.push(request.url()); });
  const response = await policy.goto("/privacy");
  expect(response?.status()).toBe(200);
  await expect(policy.getByRole("heading", { level: 1, name: "개인정보 처리방침" })).toBeVisible();
  for (const heading of ["서버에 저장하는 정보", "저장하지 않는 정보", "기기에만 저장하는 정보", "마이크", "서비스 제공 업체", "삭제", "문의"]) {
    await expect(policy.getByRole("heading", { level: 2, name: heading })).toBeVisible();
  }
  expect(offOrigin).toEqual([]);
  await visitor.close();

  await page.goto("/about");
  const link = page.getByRole("link", { name: "개인정보 처리방침" });
  await expect(link).toHaveAttribute("href", "https://hanja.uiseoya.com/privacy");
  await expect(link).toHaveAttribute("target", "_blank");
});
