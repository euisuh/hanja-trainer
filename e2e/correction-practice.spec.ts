import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

type Card = { answerIndex: number; characterKey: string; kind: string; options: Array<{ label: string }>; wordId?: number };
type Review = { cardIndex: number; correct: boolean; skipped: boolean; wordId?: number };
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function resetProfile(onboarded: boolean) {
  execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--file", "e2e/reset.sql"], { cwd: process.cwd(), stdio: "pipe" });
  if (!onboarded) return;
  execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--command", `
    UPDATE profile SET onboarded_at = 1, enabled_tracks = '["kr"]' WHERE id = 1;
    DELETE FROM review_states;
    INSERT INTO review_states (
      profile_id, character_id, track, stability, difficulty, elapsed_days, scheduled_days,
      learning_steps, reps, lapses, state, last_review, due, correct_count, total_count
    )
    SELECT 1, character_id, 'kr', 1, 5, 1, 1, 0, 1, 0, 2, 0, 0, 0, 1
    FROM character_tracks WHERE track = 'kr';
  `], { cwd: process.cwd(), stdio: "pipe" });
}

async function advanceCard(page: Page, action: () => Promise<void>) {
  const marker = `card-${Date.now()}-${Math.random()}`;
  await page.locator(".session-card-wrap").evaluate((node, value) => { node.dataset.correctionTransition = value; }, marker);
  await action();
  await expect(page.locator(`[data-correction-transition="${marker}"]`)).toHaveCount(0, { timeout: 3_000 });
}

test.beforeEach(() => resetProfile(true));
test.afterEach(() => resetProfile(false));

test("corrections preserve first-attempt writes, scoring, and bounded completion", async ({ page }) => {
  const reviewBodies: Review[][] = [];
  let summary: Record<string, number> | undefined;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/reviews/batch") && request.method() === "POST") reviewBodies.push(request.postDataJSON() as Review[]);
    if (request.url().endsWith("/api/sessions") && request.method() === "POST") summary = request.postDataJSON() as Record<string, number>;
  });

  const started = page.waitForResponse((response) => response.url().endsWith("/api/session/start") && response.ok());
  await page.goto("/review/session");
  const { cards, sessionId } = await (await started).json() as { cards: Card[]; sessionId: string };
  await expect(page.locator(".session-card-wrap")).toBeVisible();
  const gradedIndexes = cards.flatMap((card, index) => card.kind === "compare" ? [] : [index]);
  const wordIndex = cards.findIndex(({ kind }) => kind === "word");
  expect(wordIndex).toBeGreaterThanOrEqual(0);
  const missed = new Set([gradedIndexes[0], wordIndex, ...gradedIndexes.slice(-2)]);

  let originalCursor = 0;
  let correctionCount = 0;
  let failedCorrections = 0;
  let combo = 0;
  let bestCombo = 0;
  let expectedXp = 0;
  while (await page.locator(".session-card-wrap").count()) {
    const correction = await page.getByText("오답 다시 떠올리기 · 추가 점수 없음", { exact: true }).count() > 0;
    if (correction) {
      const succeeds = correctionCount < 2;
      correctionCount += 1;
      expect(correctionCount).toBeLessThanOrEqual(missed.size);
      failedCorrections += Number(!succeeds);
      await expect(page.locator(".feedback-bar__xp")).toHaveCount(0);
      await advanceCard(page, async () => {
        await page.keyboard.press("Enter");
        await page.keyboard.press(succeeds ? "2" : "1");
        if (!succeeds) await page.keyboard.press("Enter");
      });
      continue;
    }

    const card = cards[originalCursor];
    expect(card, `missing original card ${originalCursor}`).toBeTruthy();
    const cardIndex = originalCursor;
    originalCursor += 1;
    if (card.kind === "compare") {
      await advanceCard(page, () => page.keyboard.press("Enter"));
      continue;
    }

    const miss = missed.has(cardIndex);
    if (miss) combo = 0;
    else {
      expectedXp += 10 + Math.min(40, combo * 3);
      combo += 1;
      bestCombo = Math.max(bestCombo, combo);
    }
    await advanceCard(page, async () => {
      if (cardIndex === gradedIndexes[0]) {
        await page.getByRole("button", { name: "보기로 풀기" }).click();
        await page.keyboard.press(String((card.answerIndex + 1) % card.options.length + 1));
      } else {
        await page.keyboard.press("Enter");
        await page.keyboard.press(miss ? "1" : "2");
      }
      if (miss) await page.keyboard.press("Enter");
    });
  }

  expect(originalCursor).toBe(cards.length);
  expect(correctionCount).toBe(missed.size);
  expect(failedCorrections).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole("heading", { name: /했어요|좋아요/u })).toBeVisible();
  await expect.poll(() => reviewBodies.flat().length).toBe(gradedIndexes.length);

  const reviews = reviewBodies.flat();
  expect(reviews.map(({ cardIndex }) => cardIndex).sort((a, b) => a - b)).toEqual(gradedIndexes);
  expect(reviews.filter(({ correct }) => !correct).map(({ cardIndex }) => cardIndex).sort((a, b) => a - b)).toEqual([...missed].sort((a, b) => a - b));
  expect(reviews.find(({ cardIndex }) => cardIndex === gradedIndexes[0])).toMatchObject({ correct: false, skipped: false });
  expect(reviews.find(({ cardIndex }) => cardIndex === wordIndex)).toMatchObject({ correct: false, skipped: true, wordId: cards[wordIndex].wordId });

  await expect.poll(() => summary).toBeTruthy();
  expect(summary).toMatchObject({ answered: gradedIndexes.length, correct: gradedIndexes.length - missed.size, skipped: missed.size - 1, xp: expectedXp, bestCombo });

  expect(sessionId).toMatch(/^[\w-]+$/u);
  const output = execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--json", "--command", `SELECT card_index, correct, skipped, rating FROM review_log WHERE session_id = '${sessionId}' ORDER BY card_index, id`], { cwd: process.cwd(), encoding: "utf8" });
  const persisted = (JSON.parse(output) as Array<{ results: Array<{ card_index: number; correct: number; skipped: number; rating: number }> }>)[0].results;
  expect(new Set(persisted.map(({ card_index }) => card_index))).toEqual(new Set(gradedIndexes));
  expect(persisted.filter(({ card_index }) => missed.has(card_index))).not.toHaveLength(0);
  expect(persisted.filter(({ card_index }) => missed.has(card_index)).every(({ correct, rating }) => correct === 0 && rating === 1)).toBe(true);
});
