import { expect, test, type Page } from "@playwright/test";

type PublicProfile = { id: number; name: string; hasPin: boolean; isAdmin: boolean };

async function publicProfiles(page: Page): Promise<PublicProfile[]> {
  const response = await page.request.get("/api/profiles");
  expect(response.ok()).toBe(true);
  return (await response.json() as { profiles: PublicProfile[] }).profiles;
}

async function browserDelete(page: Page, path: string, body?: unknown) {
  return page.evaluate(async ({ requestPath, requestBody }) => {
    const response = await fetch(requestPath, {
      method: "DELETE",
      ...(requestBody === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody) }),
    });
    return { ok: response.ok, status: response.status, body: await response.text() };
  }, { requestPath: path, requestBody: body });
}

async function cleanUp(page: Page) {
  const profiles = await publicProfiles(page);
  if (profiles.length > 1 || profiles[0]?.hasPin) {
    const unlocked = await page.request.post("/api/pin/unlock", { data: { profileId: 1, pin: "1234" } });
    if (!unlocked.ok()) throw new Error(`cleanup unlock failed: ${unlocked.status()} ${await unlocked.text()}`);
    for (const profile of profiles.filter(({ isAdmin }) => !isAdmin)) {
      const deleted = await browserDelete(page, `/api/profiles/${profile.id}`);
      if (!deleted.ok) throw new Error(`cleanup delete failed: ${deleted.status} ${deleted.body}`);
    }
    const removed = await browserDelete(page, "/api/pin", { currentPin: "1234" });
    if (!removed.ok) throw new Error(`cleanup PIN removal failed: ${removed.status} ${removed.body}`);
  }
}

test("admin creates, renames, and permanently deletes a profile by keyboard", async ({ page }) => {
  try {
    await page.goto("/settings");
    expect((await page.request.post("/api/pin", { data: { pin: "1234" } })).ok()).toBe(true);
    expect((await page.request.post("/api/pin/unlock", { data: { profileId: 1, pin: "1234" } })).ok()).toBe(true);
    await page.reload();

    const section = page.locator(".profile-setting");
    await expect(section.getByText("1 / 5", { exact: true })).toBeVisible();
    const add = section.getByRole("button", { name: "프로필 추가" });
    await add.focus();
    await page.keyboard.press("Enter");
    await section.getByRole("textbox", { name: "프로필 이름" }).fill("아이");
    await section.getByRole("button", { name: "PIN 설정 후 만들기" }).focus();
    await page.keyboard.press("Enter");
    await expect(section.getByText("새 프로필 PIN 입력", { exact: true })).toBeVisible();
    await page.keyboard.type("4321");
    await expect(section.getByText("새 프로필 PIN 확인", { exact: true })).toBeVisible();
    const createdResponse = page.waitForResponse((response) => response.url().endsWith("/api/profiles") && response.request().method() === "POST" && response.status() === 201);
    await page.keyboard.type("4321");
    const created = await (await createdResponse).json() as { id: number };
    await expect(section.getByText("2 / 5", { exact: true })).toBeVisible();
    expect((await publicProfiles(page)).find(({ id }) => id === created.id)).toMatchObject({ name: "아이", hasPin: true, isAdmin: false });

    const pinSection = page.locator(".pin-setting");
    await pinSection.getByRole("button", { name: "PIN 해제" }).click();
    await page.keyboard.type("1234");
    await expect(pinSection.locator(".pin-message")).toHaveText("다른 프로필이 있는 동안에는 관리자 PIN을 해제할 수 없습니다.");
    await pinSection.getByRole("button", { name: "취소" }).click();

    expect((await page.request.post("/api/pin/unlock", { data: { profileId: created.id, pin: "4321" } })).ok()).toBe(true);
    await page.reload();
    await expect(page.locator(".profile-setting")).toHaveCount(0);
    await page.waitForLoadState("networkidle");

    expect((await page.request.post("/api/pin/unlock", { data: { profileId: 1, pin: "1234" } })).ok()).toBe(true);
    await page.reload();
    await section.getByRole("button", { name: "아이 이름 변경" }).click();
    const renameInput = section.getByRole("textbox", { name: "아이 새 이름" });
    await renameInput.fill("가족");
    await renameInput.press("Enter");
    await expect(section.getByText("가족", { exact: true })).toBeVisible();

    const deleteButton = section.getByRole("button", { name: "가족 프로필 삭제" });
    await deleteButton.focus();
    await page.keyboard.press("Enter");
    const confirmation = page.getByRole("alertdialog", { name: "가족 프로필을 삭제할까요?" });
    const cancelDelete = confirmation.getByRole("button", { name: "취소" });
    const permanentDelete = confirmation.getByRole("button", { name: "영구 삭제" });
    await expect(confirmation).toContainText("모든 학습 진도는 영구적으로 삭제되며 되돌릴 수 없습니다.");
    await expect(confirmation).toHaveAttribute("aria-describedby", "profile-delete-description");
    await expect(confirmation).toHaveAttribute("aria-modal", "true");
    await expect(cancelDelete).toBeFocused();
    await page.keyboard.press("h");
    await expect(page).toHaveURL(/\/settings$/u);
    await expect(confirmation).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(permanentDelete).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(cancelDelete).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(deleteButton).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(cancelDelete).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(deleteButton).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(cancelDelete).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(permanentDelete).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(section.getByText("1 / 5", { exact: true })).toBeVisible();
    await expect(section).toBeFocused();
    expect((await publicProfiles(page)).some(({ id }) => id === created.id)).toBe(false);
  } finally {
    await cleanUp(page);
  }
});
