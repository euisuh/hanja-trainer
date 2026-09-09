import { execFileSync } from "node:child_process";
import { expect, test, type Page, type Route } from "@playwright/test";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function sql(command: string) {
  return execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--command", command, "--json"], { cwd: process.cwd(), encoding: "utf8" });
}

async function shorten(route: Route) {
  const response = await route.fetch();
  const session = await response.json() as { cards: Array<{ answerIndex: number; kind: string }> };
  const card = session.cards.find((item) => item.kind !== "compare")!;
  await route.fulfill({ response, json: { ...session, cards: [card] } });
  return card;
}

async function finish(page: Page, card: { answerIndex: number }) {
  await expect(page.locator(".answer-option")).toHaveCount(4);
  await page.locator(".answer-option").nth(card.answerIndex).click();
  await expect(page.getByRole("heading", { name: /완벽했어요/u })).toBeVisible();
}

test.beforeEach(() => {
  execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--file", "e2e/reset.sql"], { cwd: process.cwd(), stdio: "pipe" });
});

test.afterEach(() => {
  execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--file", "e2e/reset.sql"], { cwd: process.cwd(), stdio: "pipe" });
});

test("two offline tabs preserve and drain both review and summary entries", async ({ context, page }) => {
  sql("UPDATE profile SET onboarded_at = 1 WHERE id = 1");
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => localStorage.getItem("e2e-outbox-offline") !== "true" });
    localStorage.setItem("e2e-outbox-offline", "true");
  });
  const other = await context.newPage();
  let firstCard!: { answerIndex: number };
  let secondCard!: { answerIndex: number };
  await page.route("**/api/session/start", async (route) => { firstCard = await shorten(route); });
  await other.route("**/api/session/start", async (route) => { secondCard = await shorten(route); });

  await Promise.all([page.goto("/lesson"), other.goto("/lesson")]);
  await expect.poll(() => Boolean(firstCard && secondCard)).toBe(true);
  await finish(page, firstCard);
  await finish(other, secondCard);

  const counts = await page.evaluate(() => ({
    reviews: Object.keys(localStorage).filter((key) => key.startsWith("hanja-trainer:pending-reviews:entry:")).length,
    summaries: Object.keys(localStorage).filter((key) => key.startsWith("hanja-trainer:pending-session-summaries:entry:")).length,
  }));
  expect(counts).toEqual({ reviews: 2, summaries: 2 });

  await page.evaluate(() => {
    localStorage.removeItem("e2e-outbox-offline");
    window.dispatchEvent(new Event("online"));
  });
  await other.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes(":entry:")).length)).toBe(0);
  const sessions = JSON.parse(sql("SELECT COUNT(*) AS count FROM sessions WHERE profile_id = 1")) as Array<{ results: Array<{ count: number }> }>;
  expect(sessions[0].results[0].count).toBe(2);
  await other.close();
});
