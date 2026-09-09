import { expect, test, type Page } from "@playwright/test";

async function browserRequest(page: Page, path: string, method: string, body?: unknown) {
  return page.evaluate(async ({ requestPath, requestMethod, requestBody }) => {
    const response = await fetch(requestPath, {
      method: requestMethod,
      headers: { "x-hanja-profile-id": "1", ...(requestBody === undefined ? {} : { "content-type": "application/json" }) },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    });
    return { status: response.status, body: await response.json() as unknown };
  }, { requestPath: path, requestMethod: method, requestBody: body });
}

test("device PIN gates direct API calls and unlocks by keyboard and mouse", async ({ page }) => {
  await page.route("**/api/pin/state", async (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "unavailable", message: "temporary" } }) }));
  await page.goto("/settings");
  await expect(page.getByRole("alert")).toHaveText("인증 또는 연결 상태를 확인하지 못했습니다.");
  await expect(page.getByRole("heading", { name: "설정" })).toHaveCount(0);
  await page.unroute("**/api/pin/state");
  await page.getByRole("button", { name: "다시 시도" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
  await page.getByRole("button", { name: "PIN 설정" }).click();
  await page.keyboard.type("1234");
  await expect(page.getByText("새 PIN 확인")).toBeVisible();
  await page.keyboard.type("1234");
  await expect(page.locator(".pin-recovery code")).toHaveText(/^[A-HJ-NP-Z2-9]{10}$/u);
  await page.getByRole("button", { name: "확인했습니다" }).click();
  await expect(page.getByRole("heading", { name: "기기 잠금" })).toBeVisible();

  for (const direct of [
    await page.request.get("/api/stats"),
    await page.request.post("/api/session/start", { data: { mode: "lesson", tracks: ["kr"] }, headers: { "x-hanja-profile-id": "1" } }),
  ]) {
    expect(direct.status()).toBe(401);
    expect(await direct.json()).toMatchObject({ error: { code: "profile_required" } });
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

test("admin recovery is one-time and unavailable to non-admin profiles", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "PIN 설정" }).click();
  await page.keyboard.type("1234");
  await page.keyboard.type("1234");
  const recoveryCode = await page.locator(".pin-recovery code").innerText();
  expect(recoveryCode).toMatch(/^[A-HJ-NP-Z2-9]{10}$/u);
  await page.getByRole("button", { name: "확인했습니다" }).click();
  await expect(page.getByRole("group", { name: /PIN 키패드/u })).toBeFocused();
  await page.keyboard.type("1234");
  await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();

  const created = await browserRequest(page, "/api/profiles", "POST", { name: "아이", pin: "4321" });
  expect(created.status).toBe(201);
  const childId = (created.body as { id: number }).id;
  await page.getByRole("button", { name: "프로필 전환" }).click();
  await expect(page.getByRole("heading", { name: "누가 학습하나요?" })).toBeVisible();

  await page.getByRole("button", { name: "아이, PIN 필요" }).click();
  await expect(page.getByRole("heading", { name: "아이" })).toBeVisible();
  await expect(page.getByRole("button", { name: "PIN을 잊으셨나요?" })).toHaveCount(0);
  await page.getByRole("button", { name: "프로필 선택" }).click();
  await page.getByRole("button", { name: "나, PIN 필요" }).click();
  await page.getByRole("button", { name: "PIN을 잊으셨나요?" }).click();
  await page.getByRole("textbox", { name: "복구 코드를 입력하세요." }).fill(recoveryCode);
  await page.getByRole("button", { name: "PIN 해제" }).click();
  await expect.poll(async () => (await browserRequest(page, "/api/profile", "GET")).status).toBe(200);
  await expect(page.locator(".unlock-screen, .profile-picker")).toHaveCount(0);
  await page.getByRole("button", { name: "프로필 전환" }).click();
  await expect(page.getByRole("heading", { name: "누가 학습하나요?" })).toBeVisible();
  await page.getByRole("button", { name: "나", exact: true }).click();
  await expect.poll(async () => (await browserRequest(page, "/api/profile", "GET")).status).toBe(200);
  await expect(page.locator(".unlock-screen, .profile-picker")).toHaveCount(0);
  expect((await browserRequest(page, `/api/profiles/${childId}`, "DELETE")).status).toBe(200);

  const reused = await browserRequest(page, "/api/pin/recover", "POST", { profileId: 1, code: recoveryCode });
  expect(reused.status).toBe(400);
  expect(reused.body).toMatchObject({ error: { code: "pin_not_set" } });
});
