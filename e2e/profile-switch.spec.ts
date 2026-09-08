import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function executeSql(sql: string) {
  execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--command", sql], { cwd: process.cwd(), stdio: "pipe" });
}

function resetProfiles() {
  execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--file", "e2e/reset.sql"], { cwd: process.cwd(), stdio: "pipe" });
}

async function browserRequest(page: Page, path: string, method = "GET", body?: unknown) {
  return page.evaluate(async ({ path: requestPath, method: requestMethod, body: requestBody }) => {
    const response = await fetch(requestPath, {
      method: requestMethod,
      headers: requestMethod === "GET" ? undefined : { "content-type": "application/json", "x-hanja-profile-id": "1" },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    });
    return { status: response.status, body: await response.json() as unknown };
  }, { path, method, body });
}

test.afterEach(() => resetProfiles());

test("keeps a stale tab's answer with its original profile", async ({ page, context }) => {
  resetProfiles();
  expect((await page.request.post("/api/pin", { data: { pin: "1234" }, headers: { "x-hanja-profile-id": "1" } })).ok()).toBe(true);
  executeSql("UPDATE profile SET onboarded_at = 1 WHERE id = 1; INSERT INTO profile (name) VALUES ('둘');");

  await page.goto("/home");
  await page.getByRole("button", { name: "나, PIN 필요" }).click();
  await page.getByRole("group", { name: /PIN 키패드/u }).pressSequentially("1234");
  await expect(page.getByRole("button", { name: /레슨 시작/u })).toBeVisible();
  const started = page.waitForResponse((response) => response.url().endsWith("/api/session/start") && response.ok());
  await page.getByRole("button", { name: /레슨 시작/u }).click();
  const session = await (await started).json() as { cards: Array<{ answerIndex: number }> };

  const other = await context.newPage();
  await other.goto("/home");
  await other.getByRole("button", { name: "프로필 전환" }).click();
  await other.getByRole("button", { name: "둘" }).click();
  await expect(other.getByRole("heading", { name: "한 글자, 세 개의 시험." })).toBeVisible();
  const settingsBefore = (await browserRequest(other, "/api/settings")).body;

  const rejected = page.waitForResponse((response) => response.url().endsWith("/api/reviews/batch") && response.status() === 409);
  await page.locator(".answer-option").nth(session.cards[0].answerIndex).click();
  expect(await (await rejected).json()).toEqual({ error: { code: "profile_changed", message: "The active profile changed" } });
  await expect(page.getByRole("heading", { name: "누가 학습하나요?" })).toBeVisible();
  expect((await browserRequest(other, "/api/stats")).body).toMatchObject({ answered: 0 });
  expect((await browserRequest(other, "/api/profile")).body).toMatchObject({ xp: 0 });
  expect((await browserRequest(other, "/api/onboarding-state")).body).toEqual({ onboarded: false });
  expect((await browserRequest(other, "/api/settings")).body).toEqual(settingsBefore);

  const synced = page.waitForResponse((response) => response.url().endsWith("/api/reviews/batch") && response.ok());
  await page.getByRole("button", { name: "나, PIN 필요" }).click();
  await page.getByRole("group", { name: /PIN 키패드/u }).pressSequentially("1234");
  await synced;
  await expect.poll(async () => ((await browserRequest(page, "/api/stats")).body as { answered: number }).answered).toBe(1);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("hanja-trainer:pending-reviews"))).toBeNull();
});

test("switches profiles without leaking progress or browser state", async ({ page }) => {
  resetProfiles();
  const browserTimezone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const alternateTimezone = browserTimezone === "UTC" ? "Asia/Seoul" : "UTC";
  const pin = await page.request.post("/api/pin", { data: { pin: "1234" }, headers: { "x-hanja-profile-id": "1" } });
  expect(pin.ok()).toBe(true);
  executeSql(`
    UPDATE profile SET name = '민지', theme = 'default', timezone = '${alternateTimezone}', onboarded_at = 1 WHERE id = 1;
    INSERT INTO profile (name) VALUES ('준');
  `);
  const publicProfiles = await (await page.request.get("/api/profiles")).json() as { profiles: Array<{ id: number; name: string }> };
  const secondId = publicProfiles.profiles.find((profile) => profile.name === "준")!.id;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    expect((await page.request.post("/api/pin/unlock", { data: { profileId: 1, pin: "0000" } })).status()).toBe(401);
  }

  let releasePatch!: () => void;
  let patchStarted!: () => void;
  let patchFinished!: () => void;
  const heldPatch = new Promise<void>((resolve) => { releasePatch = resolve; });
  const sawPatch = new Promise<void>((resolve) => { patchStarted = resolve; });
  const finishedPatch = new Promise<void>((resolve) => { patchFinished = resolve; });
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() !== "PATCH") { await route.continue(); return; }
    const response = await route.fetch();
    patchStarted();
    await heldPatch;
    try { await route.fulfill({ response }); } catch { /* The client intentionally aborted this stale response. */ }
    patchFinished();
  });

  await page.goto("/home");
  await expect(page.locator(".app")).toHaveAttribute("data-theme", "quiet-technical");
  const admin = page.getByRole("button", { name: "민지, PIN 필요" });
  const second = page.getByRole("button", { name: "준" });
  await expect(admin).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(second).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "민지" })).toBeVisible();
  await expect(page.getByRole("group", { name: /PIN 키패드/u })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "누가 학습하나요?" })).toBeVisible();
  await expect(admin).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: /PIN 키패드/u })).toBeFocused();
  await page.keyboard.type("0000");
  await expect(page.locator(".pin-message")).toContainText("초 후 다시 시도할 수 있습니다.");

  executeSql("UPDATE profile SET pin_failures = 0, pin_locked_until = NULL WHERE id = 1;");
  await page.getByRole("button", { name: "프로필 선택" }).click();
  let releaseUnlock!: () => void;
  let unlockStarted!: () => void;
  const heldUnlock = new Promise<void>((resolve) => { releaseUnlock = resolve; });
  const sawUnlock = new Promise<void>((resolve) => { unlockStarted = resolve; });
  await page.route("**/api/pin/unlock", async (route) => {
    const response = await route.fetch();
    unlockStarted();
    await heldUnlock;
    await route.fulfill({ response });
  });
  await admin.click();
  await expect(page.getByRole("group", { name: /PIN 키패드/u })).toBeFocused();
  await page.keyboard.type("1234");
  await sawUnlock;
  await expect(page.getByRole("button", { name: "프로필 선택" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "민지" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "누가 학습하나요?" })).toHaveCount(0);
  releaseUnlock();
  await expect(page).toHaveURL(/\/home$/u);
  await page.unroute("**/api/pin/unlock");
  await expect(page.locator(".active-profile strong")).toHaveText("민지");
  await expect(page.locator(".app")).toHaveAttribute("data-theme", "default");

  const started = await browserRequest(page, "/api/session/start", "POST", { mode: "lesson", tracks: ["kr"], limit: 1 });
  expect(started.status).toBe(200);
  const session = started.body as { sessionId: string; cards: Array<{ characterKey: string; track: "kr" | "jp" | "cn" }> };
  const reviewed = await browserRequest(page, "/api/reviews/batch", "POST", [{
    sessionId: session.sessionId,
    cardIndex: 0,
    characterKey: session.cards[0].characterKey,
    track: session.cards[0].track,
    correct: true,
    skipped: false,
    elapsedMs: 500,
    mode: "lesson",
  }]);
  expect(reviewed.status).toBe(200);
  const now = new Date().toISOString();
  expect((await browserRequest(page, "/api/sessions", "POST", { mode: "lesson", startedAt: now, endedAt: now, answered: 1, correct: 1, skipped: 0, bestCombo: 1, xp: 25 })).status).toBe(200);
  await page.evaluate(() => localStorage.setItem("hanja-trainer:track-imbalance-snoozes:1", JSON.stringify({ jp: Date.now() + 86_400_000 })));

  await page.goto("/stats");
  await expect(page.getByRole("heading", { name: "통계" })).toBeVisible();
  await expect(page.locator(".active-profile strong")).toHaveText("민지");
  expect((await browserRequest(page, "/api/profile")).body).toMatchObject({ id: 1, name: "민지", xp: 25 });
  await sawPatch;

  await page.getByRole("button", { name: "프로필 전환" }).click();
  await expect(page.getByRole("heading", { name: "누가 학습하나요?" })).toBeVisible();
  await expect(page.locator(".app")).toHaveAttribute("data-theme", "quiet-technical");
  releasePatch();
  await finishedPatch;
  await expect(page.locator(".app")).toHaveAttribute("data-theme", "quiet-technical");
  await expect(admin).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(second).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/onboarding$/u);
  await expect(page.getByRole("heading", { name: "한 글자, 세 개의 시험." })).toBeVisible();
  await expect(page.locator(".app-header")).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(/\/onboarding$/u);
  await page.keyboard.press("h");
  await expect(page).toHaveURL(/\/onboarding$/u);
  const placementStarted = page.waitForResponse((response) => response.url().endsWith("/api/session/start") && response.ok());
  await page.getByRole("button", { name: /배치 테스트 시작/u }).click();
  await placementStarted;
  await expect(page).toHaveURL(/\/placement$/u);
  await expect(page.getByRole("progressbar", { name: /진행률/u })).toBeVisible();
  await page.getByRole("button", { name: "세션 일시정지" }).click();
  await page.getByRole("button", { name: /세션 종료/u }).click();
  await expect(page).toHaveURL(/\/onboarding$/u);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/onboarding$/u);
  await expect(page.getByRole("heading", { name: "한 글자, 세 개의 시험." })).toBeVisible();
  await expect(page.locator(".app-header")).toHaveCount(0);

  const secondProfile = (await browserRequest(page, "/api/profile")).body;
  expect(secondProfile).toMatchObject({ id: secondId, name: "준", xp: 0, todayXp: 0, streak: 0, longestStreak: 0 });
  expect((await browserRequest(page, "/api/stats")).body).toMatchObject({ answered: 0, skipped: 0, streak: 0, longestStreak: 0 });
  const curriculum = (await browserRequest(page, "/api/curriculum?track=kr")).body as { units: Array<{ nodes: Array<{ state: string }> }> };
  expect(curriculum.units.flatMap((unit) => unit.nodes).every((node) => node.state !== "done")).toBe(true);
  expect(await page.evaluate((profileId) => ({ first: localStorage.getItem("hanja-trainer:track-imbalance-snoozes:1"), second: localStorage.getItem(`hanja-trainer:track-imbalance-snoozes:${profileId}`) }), secondId)).toEqual({ first: expect.any(String), second: null });

  executeSql(`UPDATE profile SET onboarded_at = 1, timezone = '${alternateTimezone}' WHERE id = ${secondId};`);
  await page.goto("/stats");
  const timezonePatched = page.waitForResponse((response) => {
    if (!response.url().endsWith("/api/settings") || response.request().method() !== "PATCH" || !response.ok()) return false;
    return (response.request().postDataJSON() as { timezone?: string }).timezone === browserTimezone;
  });
  await page.getByRole("button", { name: "프로필 전환" }).click();
  await expect(page.getByRole("heading", { name: "누가 학습하나요?" })).toBeVisible();
  await expect(admin).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(second).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/home$/u);
  await timezonePatched;
  await expect(page.locator(".active-profile strong")).toHaveText("준");
  await expect(page.locator(".app")).toHaveAttribute("data-theme", "quiet-technical");
  await expect(page.locator(".metric").first().locator("strong")).toHaveText("0");
  await expect(page.locator(".path-map__heading small")).toHaveText(/^0 \/ \d+ 자$/u);
  await expect(page.locator(".path-node--done")).toHaveCount(0);

  await page.goto("/settings");
  await page.getByRole("button", { name: "PIN 설정" }).click();
  await page.keyboard.type("2468");
  await page.keyboard.type("2468");
  await expect(page.getByRole("heading", { name: "누가 학습하나요?" })).toBeVisible();
  const lockedSecond = page.getByRole("button", { name: "준, PIN 필요" });
  await lockedSecond.click();
  await page.keyboard.type("2468");
  await expect(page).toHaveURL(/\/home$/u);
  await page.goto("/settings");
  await page.getByRole("button", { name: "PIN 해제" }).click();
  await page.keyboard.type("2468");
  await expect(page.getByRole("heading", { name: "누가 학습하나요?" })).toBeVisible();
  await page.getByRole("button", { name: "준", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/u);

  await page.reload();
  await expect(page).toHaveURL(/\/home$/u);
  await expect(page.locator(".active-profile strong")).toHaveText("준");
});
