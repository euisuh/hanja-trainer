import { expect, test } from "@playwright/test";

test("Talk diary shows notebook dots and unavailable metrics without attempts", async ({ page }) => {
  await page.goto("/talk/diary");
  await expect(page.getByRole("heading", { name: "Talk diary" })).toBeVisible();
  await expect(page.locator(".talk-diary-calendar__day--spoken")).toHaveCount(0);
  await expect(page.getByText("days spoken this week", { exact: false })).toContainText("0");
  await expect(page.locator(".talk-diary__metric").filter({ hasText: "첫 시도" })).toContainText("—");
});
