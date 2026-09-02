import { expect, test, type Page } from "@playwright/test";

type Card = { answerIndex: number };
type SessionResponse = { cards: Card[] };

async function startLesson(page: Page): Promise<SessionResponse> {
  const started = page.waitForResponse((response) => response.url().endsWith("/api/session/start") && response.ok());
  await page.goto("/lesson");
  return await (await started).json() as SessionResponse;
}

async function captureCorrectFeedback(page: Page, answerIndex: number) {
  await page.evaluate(() => {
    const progress = document.querySelector('[role="progressbar"]')!;
    const initialProgress = progress.getAttribute("aria-valuenow");
    let started = 0;
    window.addEventListener("keydown", () => { started = performance.now(); }, { capture: true, once: true });
    new MutationObserver((_, observer) => {
      const answer = document.querySelector(".answer-option--correct");
      const ring = document.querySelector(".quiet-glow-ring");
      const particle = document.querySelector(".particle-burst__particle");
      if (answer && !document.documentElement.dataset.feedbackStyle) {
        const style = getComputedStyle(ring && getComputedStyle(ring).display !== "none" ? ring : answer);
        document.documentElement.dataset.feedbackStyle = JSON.stringify({
          answerFont: getComputedStyle(answer.querySelector(".answer-option__copy strong")!).fontFamily,
          animationDuration: style.animationDuration,
          animationName: style.animationName,
          particleDisplay: particle ? getComputedStyle(particle).display : "missing",
        });
      }
      if (started && progress.getAttribute("aria-valuenow") !== initialProgress) {
        document.documentElement.dataset.advanceMs = String(performance.now() - started);
        observer.disconnect();
      }
    }).observe(document.body, { attributes: true, childList: true, subtree: true });
  });
  await page.keyboard.press(String(answerIndex + 1));
  await page.waitForFunction(() => Boolean(document.documentElement.dataset.feedbackStyle && document.documentElement.dataset.advanceMs));
  return await page.evaluate(() => ({
    advanceMs: Number(document.documentElement.dataset.advanceMs),
    style: JSON.parse(document.documentElement.dataset.feedbackStyle!) as { answerFont: string; animationDuration: string; animationName: string; particleDisplay: string },
  }));
}

async function contrastOf(page: Page, foregroundSelector: string, backgroundSelector = foregroundSelector) {
  return page.evaluate(({ backgroundSelector, foregroundSelector }) => {
    const channels = (value: string) => value.match(/[\d.]+/gu)!.slice(0, 3).map(Number).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    const luminance = (value: string) => {
      const [red, green, blue] = channels(value);
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const foreground = luminance(getComputedStyle(document.querySelector(foregroundSelector)!).color);
    const background = luminance(getComputedStyle(document.querySelector(backgroundSelector)!).backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  }, { backgroundSelector, foregroundSelector });
}

test("theme selection applies live and persists", async ({ page }) => {
  await page.goto("/settings");
  const app = page.locator(".app");
  await expect(app).toHaveAttribute("data-theme", "quiet-technical");

  const reset = page.waitForResponse((response) => response.url().endsWith("/api/settings") && response.request().method() === "PATCH" && response.ok());
  await page.getByRole("button", { name: "기본", exact: true }).click();
  await reset;
  await expect(app).toHaveAttribute("data-theme", "default");
  const defaultGlyphFonts = await app.evaluate((node) => ["--font-kr", "--font-jp", "--font-cn"].map((name) => getComputedStyle(node).getPropertyValue(name)));

  const saved = page.waitForResponse((response) => response.url().endsWith("/api/settings") && response.request().method() === "PATCH" && response.ok());
  await page.getByRole("button", { name: "Quiet Technical" }).click();
  await expect(app).toHaveAttribute("data-theme", "quiet-technical");
  expect(await app.evaluate((node) => {
    const style = getComputedStyle(node);
    return [style.getPropertyValue("--paper"), style.getPropertyValue("--gold"), style.getPropertyValue("--radius-extra-large"), style.getPropertyValue("--shadow-7")];
  })).toEqual(["#F7F6F4", "#B45309", "10px", "none"]);
  expect(await app.evaluate((node) => ["--font-kr", "--font-jp", "--font-cn"].map((name) => getComputedStyle(node).getPropertyValue(name)))).toEqual(defaultGlyphFonts);
  await saved;

  await page.reload();
  await expect(app).toHaveAttribute("data-theme", "quiet-technical");
  await expect(page.locator(".settings-card").first()).toHaveCSS("border-top-width", "1px");
  await expect(page.locator(".settings-card").first()).toHaveCSS("box-shadow", "none");

  const restored = page.waitForResponse((response) => response.url().endsWith("/api/settings") && response.request().method() === "PATCH" && response.ok());
  await page.getByRole("button", { name: "기본", exact: true }).click();
  await restored;
});

test("Quiet Technical swaps particles for a non-blocking glow", async ({ page }) => {
  expect((await page.request.patch("/api/settings", { data: { enabledTracks: ["kr"], theme: "quiet-technical" } })).ok()).toBe(true);
  const quietSession = await startLesson(page);
  const quiet = await captureCorrectFeedback(page, quietSession.cards[0].answerIndex);
  expect(quiet.style.animationName).toContain("om-quiet-glow");
  expect(quiet.style.animationDuration).toBe("0.8s");
  expect(quiet.style.answerFont).toContain("Space Grotesk");
  expect(quiet.style.particleDisplay).toBe("none");
  expect(quiet.advanceMs).toBeLessThan(400);
  const persistentRing = page.locator(".quiet-glow-ring").last();
  await page.waitForTimeout(300);
  await expect(persistentRing).toBeVisible();
  await expect(persistentRing).toHaveCount(0, { timeout: 2_000 });

  expect((await page.request.patch("/api/settings", { data: { enabledTracks: ["kr", "jp", "cn"], theme: "default" } })).ok()).toBe(true);
  const defaultSession = await startLesson(page);
  const defaultFeedback = await captureCorrectFeedback(page, defaultSession.cards[0].answerIndex);
  expect(defaultFeedback.style.animationName).toContain("om-pop");
  expect(defaultFeedback.style.animationName).not.toContain("om-quiet-glow");
  expect(defaultFeedback.style.answerFont).toContain("Noto Sans KR");
  expect(defaultFeedback.style.particleDisplay).not.toBe("none");
  expect(defaultFeedback.advanceMs).toBeLessThan(400);
});

test("Quiet Technical state colors and radii remain readable", async ({ page }) => {
  expect((await page.request.patch("/api/settings", { data: { enabledTracks: ["kr"], theme: "quiet-technical" } })).ok()).toBe(true);
  await page.goto("/home");
  await expect(page.locator(".review-cta strong")).toBeVisible();
  await expect(page.locator(".path-node--locked .path-node__glyph").first()).toBeVisible();
  expect(await contrastOf(page, ".review-cta strong", ".review-cta")).toBeGreaterThanOrEqual(4.5);
  expect(await contrastOf(page, ".path-node--locked .path-node__glyph")).toBeGreaterThanOrEqual(4.5);
  await expect(page.locator(".path-node--locked .path-node__glyph").first()).toHaveCSS("border-radius", "10px");

  await page.goto("/settings");
  await page.getByRole("button", { name: "PIN 설정" }).click();
  expect(await contrastOf(page, ".pin-action--secondary")).toBeGreaterThanOrEqual(4.5);

  await startLesson(page);
  expect(await contrastOf(page, ".feedback-bar > button:disabled")).toBeGreaterThanOrEqual(4.5);
  await expect(page.locator(".answer-option__key").first()).toHaveCSS("border-radius", "6px");
  await expect(page.locator(".skip-answer kbd")).toHaveCSS("border-radius", "6px");
  await page.keyboard.press("Escape");
  await expect(page.locator(".pause-modal__panel")).toHaveCSS("border-radius", "10px");

  expect((await page.request.patch("/api/settings", { data: { enabledTracks: ["kr", "jp", "cn"], theme: "default" } })).ok()).toBe(true);
});

test("reduced motion cleans hidden celebration state", async ({ page }) => {
  expect((await page.request.patch("/api/settings", { data: { enabledTracks: ["kr"], theme: "quiet-technical" } })).ok()).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const session = await startLesson(page);
  await page.locator(".celebration-layer").evaluate((layer) => {
    new MutationObserver(() => {
      if (layer.childElementCount > 0) document.documentElement.dataset.reducedBurstCreated = "true";
      if (document.documentElement.dataset.reducedBurstCreated && layer.childElementCount === 0) document.documentElement.dataset.reducedBurstCleaned = "true";
    }).observe(layer, { childList: true });
  });
  await page.keyboard.press(String(session.cards[0].answerIndex + 1));
  await page.waitForFunction(() => document.documentElement.dataset.reducedBurstCreated === "true" && document.documentElement.dataset.reducedBurstCleaned === "true");
  await expect(page.locator(".celebration-layer")).toBeHidden();
  await expect(page.locator(".particle-burst, .quiet-glow-ring")).toHaveCount(0);
  expect((await page.request.patch("/api/settings", { data: { enabledTracks: ["kr", "jp", "cn"], theme: "default" } })).ok()).toBe(true);
});
