import { expect, test, type Page } from "@playwright/test";

type Card = { answerIndex: number };
type SessionResponse = { cards: Card[] };

async function startLesson(page: Page): Promise<SessionResponse> {
  const started = page.waitForResponse((response) => response.url().endsWith("/api/session/start") && response.ok());
  await page.goto("/lesson");
  return await (await started).json() as SessionResponse;
}

async function captureCorrectFeedback(page: Page, answerIndex: number) {
  await page.evaluate((correctIndex) => {
    const progress = document.querySelector('[role="progressbar"]')!;
    const runner = document.querySelector<HTMLElement>(".session-runner")!;
    const expectedAnswer = document.querySelectorAll<HTMLElement>(".answer-option")[correctIndex];
    const answerRect = expectedAnswer.getBoundingClientRect();
    const runnerRect = runner.getBoundingClientRect();
    const answerX = answerRect.left - runnerRect.left + answerRect.width / 2;
    const answerY = answerRect.top - runnerRect.top + answerRect.height / 2;
    const initialProgress = progress.getAttribute("aria-valuenow");
    let started = 0;
    window.addEventListener("keydown", () => { started = performance.now(); }, { capture: true, once: true });
    new MutationObserver((_, observer) => {
      const answer = document.querySelector<HTMLElement>(".answer-option--correct");
      const burst = document.querySelector<HTMLElement>(".particle-burst");
      const card = document.querySelector<HTMLElement>(".quiz-card--correct");
      const glyph = document.querySelector<HTMLElement>(".quiz-card__glyph--correct");
      const particle = document.querySelector<HTMLElement>(".particle-burst__particle");
      const xp = document.querySelector<HTMLElement>(".feedback-bar__xp");
      if (answer && burst && card && glyph && particle && xp && !document.documentElement.dataset.feedbackStyle) {
        const burstStyle = getComputedStyle(burst);
        document.documentElement.dataset.feedbackStyle = JSON.stringify({
          answerFont: getComputedStyle(answer.querySelector(".answer-option__copy strong")!).fontFamily,
          answerX,
          answerY,
          burstX: Number.parseFloat(burstStyle.getPropertyValue("--burst-x")),
          burstY: Number.parseFloat(burstStyle.getPropertyValue("--burst-y")),
          cardAnimationDuration: getComputedStyle(card).animationDuration,
          cardAnimationName: getComputedStyle(card).animationName,
          cardFlashFrames: card.getAnimations().find(({ animationName }) => animationName === "om-win-flash")?.effect?.getKeyframes().map(({ boxShadow }) => boxShadow) ?? [],
          glyphAnimationName: getComputedStyle(glyph).animationName,
          particleAnimationName: getComputedStyle(particle).animationName,
          particleDisplay: getComputedStyle(particle).display,
          xpAnimationName: getComputedStyle(xp).animationName,
          xpText: xp.textContent,
        });
      }
      if (started && progress.getAttribute("aria-valuenow") !== initialProgress) {
        document.documentElement.dataset.advanceMs = String(performance.now() - started);
        observer.disconnect();
      }
    }).observe(document.body, { attributes: true, childList: true, subtree: true });
  }, answerIndex);
  await page.keyboard.press(String(answerIndex + 1));
  await page.waitForFunction(() => Boolean(document.documentElement.dataset.feedbackStyle && document.documentElement.dataset.advanceMs));
  return await page.evaluate(() => ({
    advanceMs: Number(document.documentElement.dataset.advanceMs),
    style: JSON.parse(document.documentElement.dataset.feedbackStyle!) as {
      answerFont: string;
      answerX: number;
      answerY: number;
      burstX: number;
      burstY: number;
      cardAnimationDuration: string;
      cardAnimationName: string;
      cardFlashFrames: string[];
      glyphAnimationName: string;
      particleAnimationName: string;
      particleDisplay: string;
      xpAnimationName: string;
      xpText: string;
    },
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

test("both themes share the anchored correct-answer celebration", async ({ page }) => {
  expect((await page.request.patch("/api/settings", { data: { enabledTracks: ["kr"], theme: "quiet-technical" } })).ok()).toBe(true);
  const quietSession = await startLesson(page);
  const quiet = await captureCorrectFeedback(page, quietSession.cards[0].answerIndex);
  expect(quiet.style.cardAnimationName).toContain("om-win-card");
  expect(quiet.style.cardAnimationName).toContain("om-win-flash");
  expect(quiet.style.cardAnimationDuration).toBe("0.42s, 0.62s");
  expect(quiet.style.cardFlashFrames.some((shadow) => shadow.includes("47, 125, 90"))).toBe(true);
  expect(quiet.style.glyphAnimationName).toBe("om-glyph");
  expect(quiet.style.xpAnimationName).toBe("om-count-up");
  expect(quiet.style.xpText).toBe("+10 XP");
  expect(quiet.style.answerFont).toContain("Space Grotesk");
  expect(quiet.style.particleAnimationName).toBe("om-burst");
  expect(quiet.style.particleDisplay).not.toBe("none");
  expect(Math.abs(quiet.style.burstX - quiet.style.answerX)).toBeLessThan(1);
  expect(Math.abs(quiet.style.burstY - quiet.style.answerY)).toBeLessThan(1);
  expect(quiet.advanceMs).toBeGreaterThanOrEqual(800);
  expect(quiet.advanceMs).toBeLessThan(1_200);
  await expect(page.locator(".particle-burst")).toHaveCount(0, { timeout: 2_000 });

  expect((await page.request.patch("/api/settings", { data: { enabledTracks: ["kr", "jp", "cn"], theme: "default" } })).ok()).toBe(true);
  const defaultSession = await startLesson(page);
  const defaultFeedback = await captureCorrectFeedback(page, defaultSession.cards[0].answerIndex);
  expect(defaultFeedback.style.cardAnimationName).toContain("om-win-card");
  expect(defaultFeedback.style.cardAnimationName).toContain("om-win-flash");
  expect(defaultFeedback.style.cardFlashFrames.some((shadow) => shadow.includes("88, 204, 2"))).toBe(true);
  expect(defaultFeedback.style.glyphAnimationName).toBe("om-glyph");
  expect(defaultFeedback.style.xpAnimationName).toBe("om-count-up");
  expect(defaultFeedback.style.answerFont).toContain("Noto Sans KR");
  expect(defaultFeedback.style.particleAnimationName).toBe("om-burst");
  expect(defaultFeedback.style.particleDisplay).not.toBe("none");
  expect(Math.abs(defaultFeedback.style.burstX - defaultFeedback.style.answerX)).toBeLessThan(1);
  expect(Math.abs(defaultFeedback.style.burstY - defaultFeedback.style.answerY)).toBeLessThan(1);
  expect(defaultFeedback.advanceMs).toBeGreaterThanOrEqual(800);
  expect(defaultFeedback.advanceMs).toBeLessThan(1_200);
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
  const reduced = await captureCorrectFeedback(page, session.cards[0].answerIndex);
  expect(reduced.advanceMs).toBeLessThan(650);
  expect(reduced.style.cardAnimationName).toBe("none");
  expect(reduced.style.glyphAnimationName).toBe("none");
  expect(reduced.style.xpAnimationName).toBe("none");
  await page.waitForFunction(() => document.documentElement.dataset.reducedBurstCreated === "true" && document.documentElement.dataset.reducedBurstCleaned === "true");
  await expect(page.locator(".celebration-layer")).toBeHidden();
  await expect(page.locator(".particle-burst")).toHaveCount(0);
  expect((await page.request.patch("/api/settings", { data: { enabledTracks: ["kr", "jp", "cn"], theme: "default" } })).ok()).toBe(true);
});
