import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

type Card = { answerIndex: number; kind: string };
type SessionResponse = { cards: Card[]; sessionId: string };
type Summary = { sessionId: string; endedAt: string; mode: string; xp: number };

function executeSql(sql: string) {
  execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--command", sql], { cwd: process.cwd(), stdio: "pipe" });
}

function querySql<T>(sql: string): T[] {
  const output = execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--command", sql, "--json"], { cwd: process.cwd(), encoding: "utf8" });
  return (JSON.parse(output) as Array<{ results: T[] }>)[0].results;
}

function resetProfiles() {
  execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--file", "e2e/reset.sql"], { cwd: process.cwd(), stdio: "pipe" });
}

async function shortenSession(route: Route): Promise<SessionResponse> {
  const response = await route.fetch();
  const session = await response.json() as SessionResponse;
  const card = session.cards.find((candidate) => candidate.kind !== "compare");
  if (!card) throw new Error("The session did not contain an answerable card");
  await route.fulfill({ response, json: { ...session, cards: [card] } });
  return { ...session, cards: [card] };
}

async function completeOneCard(page: Page, card: Card, heading: RegExp) {
  await expect(page.locator(".answer-option")).toHaveCount(4);
  await page.locator(".answer-option").nth(card.answerIndex).click();
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
}

test.beforeEach(() => resetProfiles());
test.afterEach(async ({ page }) => {
  await page.close();
  resetProfiles();
});

test("a rejected summary remains exportable without blocking later valid results", async ({ page }) => {
  executeSql("UPDATE profile SET onboarded_at = 1 WHERE id = 1");
  const input = { mode: "lesson", startedAt: "2026-09-08T00:00:00.000Z", endedAt: "2026-09-08T00:01:00.000Z", answered: 2, correct: 2, skipped: 0, bestCombo: 2, xp: 25 };
  const bad = { profileId: 1, input: { ...input, sessionId: "server-rejected" } };
  const good = { profileId: 1, input: { ...input, sessionId: "valid-after-rejected" } };
  await page.addInitScript(({ bad, good }) => {
    const key = "hanja-trainer:pending-session-summaries";
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ version: 1, pending: [bad, good], rejected: [] }));
  }, { bad, good });
  const sent: string[] = [];
  await page.route("**/api/sessions", async (route) => {
    const { sessionId } = route.request().postDataJSON() as Summary;
    sent.push(sessionId);
    if (sessionId === bad.input.sessionId) {
      await route.fulfill({ status: 400, json: { error: { code: "invalid_session_summary", message: "Invalid summary" } } });
    } else await route.continue();
  });

  await page.goto("/home");
  const status = page.locator(".session-summary-status");
  await expect(status).toContainText("저장할 수 없는 학습 결과를 1건 보관 중입니다.");
  await expect(status).not.toContainText("저장 중");
  await expect(status).toContainText("invalid_session_summary");
  expect(sent).toEqual([bad.input.sessionId, good.input.sessionId]);
  expect(querySql<{ count: number }>("SELECT COUNT(*) AS count FROM sessions WHERE profile_id = 1")).toEqual([{ count: 1 }]);

  await page.reload();
  await expect(status).toContainText("invalid_session_summary");
  const downloaded = page.waitForEvent("download");
  await status.getByRole("button", { name: "결과 내보내기" }).click();
  const file = await (await downloaded).path();
  expect(JSON.parse(readFileSync(file!, "utf8"))).toEqual([{ profileId: 1, raw: bad, errorCode: "invalid_session_summary" }]);
  expect(sent).toEqual([bad.input.sessionId, good.input.sessionId]);
  page.once("dialog", (dialog) => dialog.accept());
  await status.getByRole("button", { name: "보관 결과 삭제" }).click();
  await expect(status).toHaveCount(0);
});

test("offline completion reloads and saves once when its owner reconnects", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => localStorage.getItem("e2e-offline") !== "true" });
  });
  expect((await page.request.post("/api/pin", { data: { pin: "1234" }, headers: { "x-hanja-profile-id": "1" } })).ok()).toBe(true);
  executeSql("UPDATE profile SET onboarded_at = 1 WHERE id = 1; INSERT INTO profile (name, onboarded_at) VALUES ('둘', 1);");

  let session!: SessionResponse;
  await page.route("**/api/session/start", async (route) => { session = await shortenSession(route); });
  let successfulRequests = 0;
  let committedResponseLost = false;
  const summaries: Summary[] = [];
  await page.route("**/api/sessions", async (route) => {
    summaries.push(route.request().postDataJSON() as Summary);
    expect(route.request().headers()["x-hanja-profile-id"]).toBe("1");
    if (!committedResponseLost) {
      const committed = await route.fetch();
      expect(committed.ok()).toBe(true);
      committedResponseLost = true;
      await route.abort("internetdisconnected");
      return;
    }
    successfulRequests += 1;
    await route.continue();
  });

  await page.goto("/home");
  await page.getByRole("button", { name: "나, PIN 필요" }).click();
  await page.getByRole("group", { name: /PIN 키패드/u }).pressSequentially("1234");
  await page.evaluate(() => localStorage.setItem("e2e-offline", "true"));
  await page.goto("/lesson");
  await expect(page.locator(".answer-option")).toHaveCount(4);
  await completeOneCard(page, session.cards[0], /완벽했어요/u);
  await expect(page.locator(".session-summary-status")).toContainText("학습 결과 저장 중");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("hanja-trainer:pending-session-summaries") ?? "{}") as { pending: Array<{ input: Summary }> });
  expect(stored.pending).toHaveLength(1);
  expect(stored.pending[0].input.sessionId).toBe(session.sessionId);
  expect(summaries).toHaveLength(0);

  await page.evaluate(() => fetch("/api/session/end", { method: "POST" }).then((response) => response.json()));
  await page.reload();
  await page.getByRole("button", { name: "둘" }).click();
  await expect(page.locator(".home-screen")).toBeVisible();
  const attemptsBeforeOwnerReturns = summaries.length;
  await page.waitForTimeout(2_100);
  expect(summaries).toHaveLength(attemptsBeforeOwnerReturns);
  expect(await page.evaluate(() => localStorage.getItem("hanja-trainer:pending-session-summaries"))).not.toBeNull();

  await page.evaluate(() => {
    localStorage.removeItem("e2e-offline");
    window.dispatchEvent(new Event("online"));
  });
  expect(summaries).toHaveLength(attemptsBeforeOwnerReturns);

  await page.evaluate(() => fetch("/api/session/end", { method: "POST" }).then((response) => response.json()));
  await page.reload();
  const saved = page.waitForResponse((response) => response.url().endsWith("/api/sessions") && response.ok());
  await page.getByRole("button", { name: "나, PIN 필요" }).click();
  await page.getByRole("group", { name: /PIN 키패드/u }).pressSequentially("1234");
  await saved;

  await expect.poll(() => page.evaluate(() => localStorage.getItem("hanja-trainer:pending-session-summaries"))).toBeNull();
  const ownerProfile = await page.evaluate(() => fetch("/api/profile").then((response) => response.json())) as { xp: number };
  expect(ownerProfile.xp).toBe(stored.pending[0].input.xp);
  expect(committedResponseLost).toBe(true);
  expect(successfulRequests).toBe(1);
  expect(summaries).toHaveLength(2);
  expect(summaries[1]).toEqual(summaries[0]);
  expect(summaries[0]).toMatchObject({ sessionId: session.sessionId, endedAt: stored.pending[0].input.endedAt });
  expect(querySql<{ count: number }>("SELECT COUNT(*) AS count FROM sessions WHERE profile_id = 1")).toEqual([{ count: 1 }]);
});

test("placement summary failure preserves the scored result", async ({ page }) => {
  executeSql("UPDATE profile SET onboarded_at = 1 WHERE id = 1");
  let session!: SessionResponse;
  let starts = 0;
  let scores = 0;
  const summaries: Summary[] = [];
  await page.route("**/api/session/start", async (route) => { starts += 1; session = await shortenSession(route); });
  page.on("request", (request) => { if (request.url().endsWith("/api/placement/score")) scores += 1; });
  await page.route("**/api/sessions", async (route) => {
    summaries.push(route.request().postDataJSON() as Summary);
    await route.abort("internetdisconnected");
  });

  await page.goto("/placement");
  await expect(page.locator(".answer-option")).toHaveCount(4);
  await completeOneCard(page, session.cards[0], /여기서 시작해요|현재 콘텐츠의 끝/u);
  await expect(page.locator(".placement-result")).toBeVisible();
  await expect(page.locator(".session-summary-status")).toContainText("학습 결과를 저장하지 못했습니다");
  await page.waitForTimeout(2_100);

  expect(starts).toBe(1);
  expect(scores).toBe(1);
  expect(summaries.length).toBeGreaterThan(0);
  expect(summaries.every((summary) => summary.sessionId === session.sessionId && summary.mode === "placement")).toBe(true);
  expect(new Set(summaries.map((summary) => summary.endedAt)).size).toBe(1);
  await expect(page.getByText("배치 결과를 저장하지 못했습니다.")).toHaveCount(0);
});
