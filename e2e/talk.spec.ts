import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import type { ConversationChunkPayload } from "../shared/api";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const conversation = JSON.parse(readFileSync("e2e/fixtures/talk-unit-response.json", "utf8"));
const sayItems = conversation.chunks.map((chunk: ConversationChunkPayload) => ({ kind: "chunk", phase: "say", chunk }));
const sceneItem = { kind: "scene", scene: conversation.scenes[0], review: false };

function routeSession(page: Page, items: unknown[]) {
  return page.route(/\/api\/conv\/session\?unitId=1/u, (route) => route.fulfill({ json: { unit: conversation.unit, chunks: conversation.chunks, items } }));
}

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

function installTalkAudioFailureMocks() {
  class TestUtterance {
    lang = "";
    voice: { lang: string } | null = null;
    constructor(public text: string) {}
  }
  class TestAudio extends EventTarget {
    play() { this.dispatchEvent(new Event("error")); return Promise.resolve(); }
  }
  Object.defineProperty(window, "Audio", { configurable: true, value: TestAudio });
  Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: TestUtterance });
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
    addEventListener: () => undefined,
    cancel: () => undefined,
    getVoices: () => [{ lang: "ja-JP" }],
    removeEventListener: () => undefined,
    speak: (utterance: TestUtterance) => { document.documentElement.dataset.talkFallback = JSON.stringify({ lang: utterance.lang, text: utterance.text }); },
  } });
}

test.beforeEach(resetProfile);
test.afterEach(resetProfile);

test("Talk keyboard flow records, rates, and submits", async ({ page }) => {
  await page.addInitScript(installTalkMocks);
  await routeSession(page, sayItems);
  let submission: unknown;
  await page.route("**/api/conv/attempts", async (route) => {
    submission = route.request().postDataJSON();
    await route.fulfill({ json: { results: [{ grade: "good" }] } });
  });

  await page.goto("/talk/1");
  await expect(page.getByText(conversation.chunks[0].koCue)).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByText("一度(일도)")).toBeVisible();
  await expect(page.getByRole("link", { name: conversation.chunks[0].sourceRef })).toHaveAttribute("href", "https://tatoeba.org/sentences/show/1");
  await expect(page.getByText("fixture-owner")).toBeVisible();
  await page.keyboard.press("r");
  await expect(page.getByRole("button", { name: /바로/u })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("내 목소리", { exact: false })).toBeVisible();
  await page.keyboard.press("Shift+Space");
  await page.keyboard.press("3");
  await page.keyboard.press("Enter");
  await expect.poll(() => submission).toEqual([expect.objectContaining({ chunkId: 1, grade: "good", role: "say", loop: "drill", input: "voice", hints: 1, replays: 0 })]);
  await expect(page.getByText("오늘 Talk 완료")).toBeVisible();
});

test("Talk uses Japanese speech synthesis after chunk audio fails", async ({ page }) => {
  await page.addInitScript(installTalkAudioFailureMocks);
  await routeSession(page, sayItems);
  let submission: unknown;
  await page.route("**/api/conv/attempts", async (route) => {
    submission = route.request().postDataJSON();
    await route.fulfill({ json: { results: [{ grade: "good" }] } });
  });

  await page.goto("/talk/1");
  await expect(page.getByText(conversation.chunks[0].koCue)).toBeVisible();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: /듣기/u }).click();
  await expect.poll(() => page.locator("html").getAttribute("data-talk-fallback")).toContain(`"lang":"ja-JP"`);
  await expect(page.locator("html")).toHaveAttribute("data-talk-fallback", expect.stringContaining(conversation.chunks[0].ja));
  // SAFETY: document.activeElement can be non-HTMLElement; blur only applies to focused controls.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect.poll(() => submission).toEqual([expect.objectContaining({ loop: "drill", input: "keyboard", hints: 1, replays: 1 })]);
});

test("Talk attempt queues offline then flushes", async ({ page }) => {
  await page.addInitScript(installTalkMocks);
  await routeSession(page, sayItems);
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

test("Talk scene keeps NPC text hidden and self-grades tap answers", async ({ page }) => {
  await page.addInitScript(installTalkMocks);
  await routeSession(page, [sceneItem]);
  let submission: unknown;
  await page.route("**/api/conv/attempts", async (route) => { submission = route.request().postDataJSON(); await route.fulfill({ json: { results: [{ grade: "good" }] } }); });

  await page.goto("/talk/1");
  await page.getByRole("button", { name: "장면 시작" }).click();
  await expect(page.getByText("상대방")).toBeVisible();
  await expect(page.getByText(conversation.chunks[0].ja)).toBeHidden();
  await page.getByRole("button", { name: /다음/u }).click();
  await expect(page.getByText(conversation.chunks[0].koCue)).toBeVisible();
  await page.getByRole("button", { name: "말했어요" }).click();
  await page.getByRole("button", { name: "바로" }).click();
  await expect.poll(() => submission).toEqual([expect.objectContaining({ grade: "good", input: "tap", loop: "roleplay" })]);
});
