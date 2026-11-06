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

test("profile updates avoid duplicate reads and reject stale or mismatched detail", async ({ page }) => {
  let profileReads = 0;
  let releaseDelayed: (() => void) | undefined;
  let delayNext = false;
  await page.route("**/api/profile", async (route) => {
    profileReads += 1;
    if (delayNext) {
      delayNext = false;
      await new Promise<void>((resolve) => { releaseDelayed = resolve; });
    }
    await route.fulfill({ json: profile });
  });
  await page.goto("/settings");
  await expect(page.locator(".app-header")).toContainText("120XP");
  profileReads = 0;

  const patched = page.waitForResponse((response) => response.url().endsWith("/api/settings") && response.request().method() === "PATCH" && response.ok());
  await page.getByRole("slider", { name: "일일 XP 목표" }).fill("50");
  await patched;
  await expect.poll(() => profileReads).toBe(1);

  profileReads = 0;
  await page.evaluate((updated) => window.dispatchEvent(new CustomEvent("hanja-trainer:profile-updated", { detail: updated })), { ...profile, xp: 150, todayXp: 50, goal: 50 });
  await expect(page.locator(".app-header")).toContainText("150XP");
  expect(profileReads).toBe(0);

  delayNext = true;
  const staleResponse = page.waitForResponse((response) => response.url().endsWith("/api/profile") && response.ok());
  await page.evaluate(() => window.dispatchEvent(new Event("hanja-trainer:profile-updated")));
  await expect.poll(() => profileReads).toBe(1);
  await page.evaluate((updated) => window.dispatchEvent(new CustomEvent("hanja-trainer:profile-updated", { detail: updated })), { ...profile, xp: 175, todayXp: 50, goal: 50 });
  releaseDelayed?.();
  await staleResponse;
  await expect(page.locator(".app-header")).toContainText("175XP");

  await page.evaluate((updated) => window.dispatchEvent(new CustomEvent("hanja-trainer:profile-updated", { detail: updated })), { ...profile, id: 2, xp: 999 });
  expect(profileReads).toBe(1);
  await expect(page.locator(".app-header")).not.toContainText("999XP");
});

test("streak text and boundary meet contrast", async ({ page }) => {
  const state = { todayXp: 20 };
  await mockProfile(page, state);

  {
    await page.goto("/settings");

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
      const card = parse(appStyle.getPropertyValue("--card").trim());
      const foreground = parse(getComputedStyle(metric.querySelector("strong")!).color);
      const border = parse(metricStyle.borderTopColor);
      return {
        boundary: contrast(border, parse(appStyle.backgroundColor)),
        text: contrast(foreground, card),
      };
    });

    expect(ratios.text).toBeGreaterThanOrEqual(4.5);
    expect(ratios.boundary).toBeGreaterThanOrEqual(3);
  }
});
