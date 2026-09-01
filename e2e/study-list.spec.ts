import { expect, test } from "@playwright/test";

test("previews one unit with cross-track keyboard controls", async ({ page }) => {
  await page.addInitScript(() => {
    class TestUtterance {
      lang = "";
      voice: { lang: string } | null = null;
      constructor(public text: string) {}
    }
    const voices = [{ lang: "ko-KR" }, { lang: "ja-JP" }];
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: TestUtterance });
    Object.defineProperty(window, "speechSynthesis", { value: {
      addEventListener: (name: string, listener: EventListener) => { if (name === "voiceschanged") window.addEventListener("test-voiceschanged", listener); },
      cancel: () => undefined,
      getVoices: () => document.documentElement.dataset.voicesReady ? voices : [],
      removeEventListener: (name: string, listener: EventListener) => { if (name === "voiceschanged") window.removeEventListener("test-voiceschanged", listener); },
      speak: (utterance: { lang: string; text: string }) => { document.documentElement.dataset.lastSpeech = JSON.stringify({ lang: utterance.lang, text: utterance.text }); },
    } });
  });
  expect((await page.request.patch("/api/settings", { data: { enabledTracks: ["kr", "jp", "cn"] } })).ok()).toBe(true);
  await page.goto("/home");

  const requests: string[] = [];
  page.on("request", (request) => { if (/\/api\/curriculum\/units\/\d+$/u.test(request.url())) requests.push(request.url()); });
  const loaded = page.waitForResponse((response) => /\/api\/curriculum\/units\/\d+$/u.test(response.url()) && response.ok());
  await page.getByRole("button", { name: /학습 목록/u }).click();
  const payload = await (await loaded).json() as { characters: unknown[] };

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".unit-study__table tbody tr")).toHaveCount(payload.characters.length);
  await expect(page.getByRole("columnheader", { name: "한국 · 훈음" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "日本 · 音/訓" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "中国 · 拼音" })).toBeVisible();
  expect(requests).toHaveLength(1);

  const curriculum = await (await page.request.get("/api/curriculum?track=kr")).json() as { units: Array<{ id: number }> };
  const firstUnitLoaded = page.waitForResponse((response) => /\/api\/curriculum\/units\/\d+$/u.test(response.url()) && response.ok());
  await page.goto(`/study/${curriculum.units[0].id}`);
  const firstUnit = await (await firstUnitLoaded).json() as { characters: unknown[] };
  await expect(page.locator(".unit-study__table tbody tr")).toHaveCount(firstUnit.characters.length);

  await expect(page.locator("[data-study-audio]")).toHaveCount(0);
  const silentControls = page.locator("[data-study-control]");
  const silentSentence = page.locator(".unit-study__sentence [data-study-control]").first();
  await silentControls.first().focus();
  await silentControls.first().press("Enter");
  expect(await page.locator("html").getAttribute("data-last-speech")).toBeNull();
  await page.keyboard.press("ArrowDown");
  await expect(silentControls.nth(1)).toBeFocused();
  await silentSentence.focus();
  await expect(silentSentence).toBeFocused();
  await page.evaluate(() => { document.documentElement.dataset.voicesReady = "true"; window.dispatchEvent(new Event("test-voiceschanged")); });

  const krReading = page.getByRole("button", { name: /한국 · 훈음 읽기 듣기/u }).first();
  const krSentence = page.getByRole("button", { name: /한국 · 훈음 예문 듣기/u }).first();
  const jpReading = page.getByRole("button", { name: /日本 · 音\/訓 읽기 듣기/u }).first();
  await krReading.press("Enter");
  await expect.poll(() => page.locator("html").getAttribute("data-last-speech")).toContain('"lang":"ko-KR"');
  await krSentence.press("Space");
  await expect.poll(() => page.locator("html").getAttribute("data-last-speech")).toContain('"lang":"ko-KR"');
  await jpReading.press("Enter");
  await expect.poll(() => page.locator("html").getAttribute("data-last-speech")).toContain('"lang":"ja-JP"');
  await expect(page.getByRole("button", { name: /中国 · 拼音 .* 듣기/u })).toHaveCount(0);
  await expect(page.locator(".unit-study__sentence mark").first()).toBeVisible();

  const studyControls = page.locator("[data-study-control]");
  await studyControls.first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(studyControls.nth(1)).toBeFocused();
  await page.setViewportSize({ width: 430, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator(".home-screen")).toBeVisible();
});
