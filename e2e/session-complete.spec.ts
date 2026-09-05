import { expect, test, type Page } from "@playwright/test";

const completion = {
  xp: 36,
  accuracy: 96,
  bestCombo: 6,
  nextReview: "내일",
  answered: 8,
  correct: 8,
  skipped: 2,
  profile: {
    id: 1,
    name: "나",
    isAdmin: true,
    xp: 1234,
    todayXp: 36,
    goal: 40,
    streak: 5,
    longestStreak: 8,
    enabledTracks: ["kr"],
  },
};

async function openCompletion(page: Page, result: object) {
  await page.goto("/home");
  await expect(page.locator(".home-screen")).toBeVisible();
  await page.evaluate((nextResult) => {
    window.history.pushState({ idx: (window.history.state?.idx ?? 0) + 1, key: "completion-test", usr: nextResult }, "", "/session-complete");
    window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
  }, result);
}

async function completionXpContrast(page: Page) {
  return page.locator(".session-complete__xp").evaluate((xp) => {
    const channel = (value: number) => {
      const normalized = value / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (value: string) => {
      const [red, green, blue] = value.match(/[\d.]+/gu)!.slice(0, 3).map(Number);
      return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
    };
    const foreground = getComputedStyle(xp).color;
    const background = getComputedStyle(xp.closest(".app")!).backgroundColor;
    const foregroundLuminance = luminance(foreground);
    const backgroundLuminance = luminance(background);
    return {
      background,
      foreground,
      ratio: (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
        / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05),
    };
  });
}

test("session completion stages celebration, XP, stats, and profile payoff", async ({ page }) => {
  await openCompletion(page, completion);

  const heading = page.getByRole("heading", { name: "완벽했어요 +36 XP" });
  await expect(heading).toBeFocused();
  const shownXp = page.locator(".session-complete__xp");
  await expect(shownXp).toHaveAttribute("aria-hidden", "true");
  await expect(shownXp).toHaveText("+0 XP");
  await expect(page.locator(".particle-burst")).toHaveCount(0);
  await expect(page.locator('.particle-burst[data-tier="3"]')).toBeAttached();
  await expect(shownXp).toHaveText("+36 XP", { timeout: 2_000 });

  const statLabels = await page.locator(".session-complete__stats small").allTextContents();
  expect(statLabels).toEqual(["정확도", "응답", "최고 콤보", "다음 복습", "모름"]);
  await expect(page.locator(".session-complete__stat--quiet")).toContainText("2회");
  expect(await page.locator(".session-complete__stats > div").evaluateAll((tiles) => tiles.map((tile) => getComputedStyle(tile).animationDelay))).toEqual(["0.7s", "0.76s", "0.82s", "0.88s", "0.94s"]);
  await expect(page.locator(".session-complete__profile")).toContainText("연속5일오늘36/40 XP누적1,234 XP");
  await expect(page.locator(".session-complete > button")).toContainText("지도로 가기");

  await page.keyboard.press("Enter");
  await expect(page.locator(".home-screen")).toBeVisible();
});

test("completion XP stays readable in both themes", async ({ page }) => {
  for (const theme of ["default", "quiet-technical"] as const) {
    expect((await page.request.patch("/api/settings", { data: { enabledTracks: ["kr"], theme } })).ok()).toBe(true);
    await openCompletion(page, completion);
    await expect(page.locator(".app")).toHaveAttribute("data-theme", theme);

    const contrast = await completionXpContrast(page);
    expect(
      contrast.ratio,
      `${theme}: ${contrast.foreground} on ${contrast.background}`,
    ).toBeGreaterThanOrEqual(3);
  }

  expect((await page.request.patch("/api/settings", { data: { enabledTracks: ["kr", "jp", "cn"], theme: "default" } })).ok()).toBe(true);
});

test("failed unit test does not celebrate", async ({ page }) => {
  await openCompletion(page, {
    ...completion,
    profile: undefined,
    unitTest: { passed: false, correct: 5, total: 8, required: 8, mistakes: 3 },
  });

  await expect(page.getByRole("heading", { name: "유닛 테스트 실패" })).toBeFocused();
  await page.waitForTimeout(400);
  await expect(page.locator(".particle-burst")).toHaveCount(0);
});

test("reduced motion shows final XP without animation or burst", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openCompletion(page, { ...completion, skipped: 0 });

  await expect(page.locator(".session-complete__xp")).toHaveText("+36 XP");
  await page.waitForTimeout(400);
  await expect(page.locator(".particle-burst")).toHaveCount(0);
  for (const selector of [".session-complete__glyph", ".session-complete h1", ".session-complete__stats > div", ".session-complete__profile", ".session-complete > button"]) {
    await expect(page.locator(selector).first()).toHaveCSS("animation-name", "none");
  }
});
