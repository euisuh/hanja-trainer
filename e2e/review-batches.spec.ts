/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion -- This spec predates the changed-file lint; it narrows the app's own request body. */
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const storageKey = "hanja-trainer:pending-reviews";

test.afterEach(() => {
  execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--file", "e2e/reset.sql"], { cwd: process.cwd(), stdio: "pipe" });
});

test("drains a stored review backlog in ordered four-item requests", async ({ page }) => {
  const reviews = Array.from({ length: 100 }, (_, cardIndex) => ({
    profileId: 1,
    input: { sessionId: "stored-backlog", cardIndex, characterKey: "一", track: "kr", correct: true, skipped: false, elapsedMs: 500, mode: "review" },
  }));
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: JSON.stringify(reviews) });
  const batches: number[][] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/reviews/batch")) batches.push((request.postDataJSON() as Array<{ cardIndex: number }>).map(({ cardIndex }) => cardIndex));
  });

  await page.goto("/home");
  // The outbox lives in the lazily loaded App chunk: an entry count of 0 right after load means
  // "not rehydrated yet", so wait for the drain itself before checking that storage is empty.
  await expect.poll(() => batches.length, { timeout: 30_000 }).toBe(25);
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("hanja-trainer:pending-reviews:entry:")).length), { timeout: 30_000 }).toBe(0);

  expect(batches.every((batch) => batch.length <= 4)).toBe(true);
  expect(batches.flat()).toEqual(Array.from({ length: 100 }, (_, index) => index));
});
