import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const conversation = JSON.parse(readFileSync("e2e/fixtures/talk-unit-response.json", "utf8"));

function resetProfile() {
  execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--file", "e2e/reset.sql"], { cwd: process.cwd(), stdio: "pipe" });
  execFileSync(npx, ["wrangler", "d1", "execute", "hanja", "--local", "--command", "UPDATE profile SET onboarded_at = 1 WHERE id = 1"], { cwd: process.cwd(), stdio: "pipe" });
}

function installTalkMocks() {
  class TestRecorder {
    state: "inactive" | "recording" = "inactive";
    mimeType = "audio/webm";
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onstop: ((event: Event) => void) | null = null;
    start() { this.state = "recording"; queueMicrotask(() => this.stop()); }
    stop() {
      if (this.state === "inactive") return;
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["clip"], { type: this.mimeType }) });
      this.onstop?.(new Event("stop"));
    }
  }
  Object.defineProperty(window, "MediaRecorder", { configurable: true, value: TestRecorder });
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
    getUserMedia: async () => ({ getTracks: () => [{ stop: () => undefined }] }),
  } });
}

test.beforeEach(resetProfile);
test.afterEach(resetProfile);

test("Talk keyboard flow records, rates, and submits", async ({ page }) => {
  await page.addInitScript(installTalkMocks);
  await page.route("**/api/conv/units/1", (route) => route.fulfill({ json: conversation }));
  let submission: unknown;
  await page.route("**/api/conv/attempts", async (route) => {
    submission = route.request().postDataJSON();
    await route.fulfill({ json: { results: [{ grade: "good" }] } });
  });

  await page.goto("/talk/1");
  await expect(page.getByText(conversation.chunks[0].koCue)).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByRole("link", { name: conversation.chunks[0].sourceRef })).toHaveAttribute("href", "https://tatoeba.org/sentences/show/1");
  await page.keyboard.press("r");
  await expect(page.getByRole("button", { name: /바로/u })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("내 목소리", { exact: false })).toBeVisible();
  await page.keyboard.press("Shift+Space");
  await page.keyboard.press("3");
  await page.keyboard.press("Enter");
  await expect.poll(() => submission).toEqual([expect.objectContaining({ chunkId: 1, grade: "good", role: "say" })]);
  await expect(page.locator(".home-screen")).toBeVisible();
});

test("Talk attempt queues offline then flushes", async ({ page }) => {
  await page.addInitScript(installTalkMocks);
  await page.route("**/api/conv/units/1", (route) => route.fulfill({ json: conversation }));
  let calls = 0;
  await page.route("**/api/conv/attempts", async (route) => {
    calls += 1;
    await route.fulfill({ json: { results: [{ grade: "good" }] } });
  });

  await page.goto("/talk/1");
  await expect(page.getByText(conversation.chunks[0].koCue)).toBeVisible();
  await page.context().setOffline(true);
  await page.keyboard.press("r");
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("hanja-trainer:pending-conversation-attempts:entry:")).length)).toBe(1);
  expect(calls).toBe(0);
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => calls).toBe(1);
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("hanja-trainer:pending-conversation-attempts:entry:")).length)).toBe(0);
});
