import { expect, test, type Page } from "@playwright/test";

const profile = {
  id: 1,
  name: "나",
  isAdmin: true,
  xp: 120,
  todayXp: 20,
  goal: 40,
  streak: 7,
  longestStreak: 12,
  enabledTracks: ["kr"] as const,
};

async function mockProfile(page: Page, state: { todayXp: number }) {
  await page.route("**/api/profile", async (route) => {
    await route.fulfill({ json: { ...profile, todayXp: state.todayXp } });
  });
}

async function refreshProfile(page: Page) {
  const refreshed = page.waitForResponse((response) => response.url().endsWith("/api/profile") && response.ok());
  await page.evaluate(() => window.dispatchEvent(new Event("hanja-trainer:profile-updated")));
  await refreshed;
}

test("daily goal stays conic and sweeps through completion", async ({ page }) => {
  const state = { todayXp: 20 };
  await mockProfile(page, state);
  expect((await page.request.patch("/api/settings", { data: { theme: "default" } })).ok()).toBe(true);
  await page.goto("/settings");

  const goal = page.locator(".daily-goal");
  const ring = page.locator(".daily-goal__ring");
  await expect(goal).toContainText("오늘 20/40 XP");
  await expect(goal).not.toHaveClass(/daily-goal--met/u);
  await expect(ring).toHaveAttribute("aria-label", "일일 목표 50% 달성");
  expect(await ring.evaluate((node) => getComputedStyle(node).backgroundImage)).toContain("conic-gradient");
  expect(await ring.evaluate((node) => {
    node.getAnimations().forEach((animation) => animation.finish());
    return node.style.getPropertyValue("--goal-degrees");
  })).toBe("180deg");

  await ring.evaluate((node) => {
    const observer = new MutationObserver(() => {
      requestAnimationFrame(() => {
        const transition = node.getAnimations().find((animation) => animation instanceof CSSTransition && animation.transitionProperty === "--goal-degrees") as CSSTransition | undefined;
        document.documentElement.dataset.goalTransition = JSON.stringify({
          backgroundImage: getComputedStyle(node).backgroundImage,
          duration: transition?.effect?.getTiming().duration ?? 0,
          property: transition?.transitionProperty ?? "",
        });
        observer.disconnect();
      });
    });
    observer.observe(node, { attributeFilter: ["style"], attributes: true });
  });

  state.todayXp = 40;
  await refreshProfile(page);
  await expect(goal).toContainText("오늘 40/40 XP");
  await expect(goal).toHaveClass(/daily-goal--met/u);
  await page.waitForFunction(() => Boolean(document.documentElement.dataset.goalTransition));
  const transition = await page.evaluate(() => JSON.parse(document.documentElement.dataset.goalTransition!) as { backgroundImage: string; duration: number; property: string });
  expect(transition.backgroundImage).toContain("conic-gradient");
  expect(transition.property).toBe("--goal-degrees");
  expect(transition.duration).toBe(700);

  await ring.evaluate((node) => node.getAnimations().forEach((animation) => animation.finish()));
  expect(await ring.evaluate((node) => getComputedStyle(node).backgroundImage)).toContain("conic-gradient");
});

test("reduced motion keeps the completed ring visible without sweeping", async ({ page }) => {
  const state = { todayXp: 20 };
  await mockProfile(page, state);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/settings");

  const goal = page.locator(".daily-goal");
  const ring = page.locator(".daily-goal__ring");
  await expect(goal).toContainText("오늘 20/40 XP");
  state.todayXp = 40;
  await refreshProfile(page);
  await expect(goal).toHaveClass(/daily-goal--met/u);
  await expect(ring).toHaveCSS("transition-property", "none");
  expect(await ring.evaluate((node) => getComputedStyle(node).backgroundImage)).toContain("conic-gradient");
  expect(await ring.evaluate((node) => node.getAnimations().some((animation) => animation instanceof CSSTransition && animation.transitionProperty === "--goal-degrees"))).toBe(false);
});

test("streak text and boundary meet contrast in both themes", async ({ page }) => {
  const state = { todayXp: 20 };
  await mockProfile(page, state);

  for (const theme of ["default", "quiet-technical"] as const) {
    expect((await page.request.patch("/api/settings", { data: { theme } })).ok()).toBe(true);
    await page.goto("/settings");
    const app = page.locator(".app");
    await expect(app).toHaveAttribute("data-theme", theme);

    const ratios = await page.locator(".metric--streak").evaluate((metric) => {
      const parse = (value: string) => {
        if (value.startsWith("#")) return [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
        return value.match(/[\d.]+/gu)!.slice(0, 3).map(Number);
      };
      const luminance = (value: number[]) => value.map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
      const contrast = (first: number[], second: number[]) => {
        const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
        return (values[0] + 0.05) / (values[1] + 0.05);
      };
      const app = metric.closest<HTMLElement>(".app")!;
      const appStyle = getComputedStyle(app);
      const metricStyle = getComputedStyle(metric);
      const flame = parse(appStyle.getPropertyValue("--flame").trim());
      const card = parse(appStyle.getPropertyValue("--card").trim());
      const gradientStart = flame.map((channel, index) => channel * 0.14 + card[index] * 0.86);
      const foreground = parse(getComputedStyle(metric.querySelector("strong")!).color);
      const border = parse(metricStyle.borderTopColor);
      return {
        boundary: contrast(border, parse(appStyle.backgroundColor)),
        text: Math.min(contrast(foreground, gradientStart), contrast(foreground, card)),
      };
    });

    expect(ratios.text).toBeGreaterThanOrEqual(4.5);
    expect(ratios.boundary).toBeGreaterThanOrEqual(3);
  }
});
