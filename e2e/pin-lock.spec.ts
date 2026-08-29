import { expect, test } from "@playwright/test";

test("device PIN gates direct API calls and unlocks by keyboard and mouse", async ({ page }) => {
  await page.route("**/api/pin/state", async (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "unavailable", message: "temporary" } }) }));
  await page.goto("/settings");
  await expect(page.getByText("잠금 상태 확인 중…")).toBeVisible();
  await expect(page.getByRole("heading", { name: "설정" })).toHaveCount(0);
  await page.unroute("**/api/pin/state");
  await page.reload();
  await page.getByRole("button", { name: "PIN 설정" }).click();
  await page.keyboard.type("1234");
  await expect(page.getByText("새 PIN 확인")).toBeVisible();
  await page.keyboard.type("1234");
  await expect(page.getByRole("heading", { name: "기기 잠금" })).toBeVisible();

  for (const direct of [
    await page.request.get("/api/stats"),
    await page.request.post("/api/session/start", { data: { mode: "lesson", tracks: ["kr"] } }),
  ]) {
    expect(direct.status()).toBe(401);
    expect(await direct.json()).toMatchObject({ error: { code: "pin_required" } });
  }

  await page.reload();
  const pad = page.getByRole("group", { name: /PIN 키패드/u });
  await expect(pad).toBeFocused();
  await page.keyboard.type("12");
  await page.keyboard.press("Backspace");
  await expect(pad).toHaveAttribute("aria-label", /1자리 입력됨/u);
  await page.keyboard.press("Escape");
  await expect(pad).toHaveAttribute("aria-label", /0자리 입력됨/u);
  await page.keyboard.press("Enter");
  await page.keyboard.type("0000");
  await expect(page.locator(".pin-message")).toHaveText("PIN이 올바르지 않습니다.");
  await page.keyboard.type("1234");
  await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();

  await page.getByRole("button", { name: "PIN 변경" }).click();
  await page.keyboard.type("1234");
  await page.keyboard.type("5678");
  await page.keyboard.type("5678");
  await expect(page.getByRole("heading", { name: "기기 잠금" })).toBeVisible();

  await page.goto("/stats");
  for (const digit of ["5", "6", "7", "8"]) await page.getByRole("button", { name: digit, exact: true }).click();
  await expect(page.getByRole("heading", { name: "통계" })).toBeVisible();

  await page.goto("/settings");
  await page.getByRole("button", { name: "PIN 해제" }).click();
  await page.keyboard.type("5678");
  await expect(page.getByRole("button", { name: "PIN 설정" })).toBeVisible();
});
