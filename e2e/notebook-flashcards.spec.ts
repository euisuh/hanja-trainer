import { expect, test, type Page } from "@playwright/test";

type SessionResponse = { cards: Array<{ kind: string }> };

async function setNotebookAppearance(page: Page, tracks: string[]) {
  const response = await page.request.patch("/api/settings", {
    headers: { "x-hanja-profile-id": "1" },
    data: { appearance: "notebook", enabledTracks: tracks },
  });
  expect(response.ok()).toBe(true);
}

async function startLesson(page: Page) {
  const started = page.waitForResponse((response) => response.url().endsWith("/api/session/start") && response.ok());
  await page.goto("/lesson");
  // SAFETY: endpoint response is the typed session-start payload used by this spec.
  const session = await (await started).json() as SessionResponse;
  let index = 0;
  while (session.cards[index]?.kind === "compare") {
    await page.keyboard.press("Enter");
    index += 1;
  }
  await expect(page.locator(".quiz-card__glyph")).toBeVisible();
}

test("Notebook flashcards use Klee One only for Japanese glyphs", async ({ page }) => {
  try {
    await setNotebookAppearance(page, ["jp"]);
    await startLesson(page);
    await expect(page.locator(".app")).toHaveAttribute("data-appearance", "notebook");
    await expect(page.locator(".quiz-card--jp .quiz-card__glyph")).toHaveCSS("font-family", /Klee One/u);

    await setNotebookAppearance(page, ["kr"]);
    await page.reload();
    await startLesson(page);
    await expect(page.locator(".quiz-card--kr .quiz-card__glyph")).not.toHaveCSS("font-family", /Klee One/u);
    await expect(page.locator(".quiz-card--kr .quiz-card__glyph")).toHaveCSS("font-family", /Noto Serif KR/u);

    await setNotebookAppearance(page, ["cn"]);
    await page.reload();
    await startLesson(page);
    await expect(page.locator(".quiz-card--cn .quiz-card__glyph")).not.toHaveCSS("font-family", /Klee One/u);
    await expect(page.locator(".quiz-card--cn .quiz-card__glyph")).toHaveCSS("font-family", /Noto Serif SC/u);
  } finally {
    const reset = await page.request.patch("/api/settings", {
      headers: { "x-hanja-profile-id": "1" },
      data: { appearance: "classic", enabledTracks: ["kr", "jp", "cn"] },
    });
    expect(reset.ok()).toBe(true);
  }
});
