import { expect, test, type Page } from "@playwright/test";

type Track = "jp" | "cn";
type Curriculum = { units: Array<{ id: number }> };
type UnitStudy = { characters: Array<{ tracks: Array<{ track: string; sentences: Array<{ reading: string | null }> }> }> };

async function unitWithSpeakingCard(page: Page, track: Track): Promise<number> {
  const curriculum = await (await page.request.get(`/api/curriculum?track=${track}`)).json() as Curriculum;
  for (const unit of curriculum.units) {
    const detail = await (await page.request.get(`/api/curriculum/units/${unit.id}`)).json() as UnitStudy;
    if (detail.characters.some((character) => character.tracks.some((entry) => entry.track === track && entry.sentences.some((sentence) => sentence.reading)))) return unit.id;
  }
  throw new Error(`missing ${track} speaking card`);
}

async function unitWithTwoSpeakingCards(page: Page, track: Track): Promise<number> {
  const curriculum = await (await page.request.get(`/api/curriculum?track=${track}`)).json() as Curriculum;
  for (const unit of curriculum.units) {
    const detail = await (await page.request.get(`/api/curriculum/units/${unit.id}`)).json() as UnitStudy;
    const cards = detail.characters.flatMap((character) => character.tracks.filter((entry) => entry.track === track).flatMap((entry) => entry.sentences.filter((sentence) => sentence.reading)));
    if (cards.length >= 2) return unit.id;
  }
  throw new Error(`missing unit with at least two ${track} speaking cards`);
}

function installSpeakingMocks() {
  class TestUtterance {
    lang = "";
    voice: { lang: string } | null = null;
    constructor(public text: string) {}
  }
  class TestRecorder {
    state: "inactive" | "recording" = "inactive";
    mimeType = "audio/webm";
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onstop: ((event: Event) => void) | null = null;
    start() { this.state = "recording"; }
    stop() {
      if (this.state === "inactive") return;
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["local clip"], { type: this.mimeType }) });
      this.onstop?.(new Event("stop"));
    }
  }
  const voices = [{ lang: "ja-JP" }, { lang: "zh-CN" }];
  let requests = 0;
  let stops = 0;
  let urls = 0;
  const revoked: string[] = [];
  const nativeCreate = URL.createObjectURL.bind(URL);
  const nativeRevoke = URL.revokeObjectURL.bind(URL);
  Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: TestUtterance });
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
    addEventListener: () => undefined,
    cancel: () => undefined,
    getVoices: () => voices,
    removeEventListener: () => undefined,
    speak: (utterance: TestUtterance) => { document.documentElement.dataset.lastReference = JSON.stringify({ lang: utterance.lang, text: utterance.text }); },
  } });
  Object.defineProperty(window, "MediaRecorder", { configurable: true, value: TestRecorder });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
    getUserMedia: async (constraints: MediaStreamConstraints) => {
      requests += 1;
      document.documentElement.dataset.microphoneRequests = String(requests);
      document.documentElement.dataset.microphoneConstraints = JSON.stringify(constraints);
      return { getTracks: () => [{ stop: () => { stops += 1; document.documentElement.dataset.stoppedTracks = String(stops); } }] } as unknown as MediaStream;
    },
  } });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: (blob: Blob) => {
    urls += 1;
    const url = nativeCreate(blob);
    document.documentElement.dataset.clipUrls = String(urls);
    return url;
  } });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: (url: string) => {
    revoked.push(url);
    document.documentElement.dataset.revokedClips = String(revoked.length);
    nativeRevoke(url);
  } });
}

test("records and replays JP and CN locally without uploading audio", async ({ page }) => {
  await page.addInitScript(installSpeakingMocks);

  const unexpectedWrites: Array<{ method: string; url: string }> = [];
  page.on("request", (request) => {
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    if (method !== "GET" && !(method === "PATCH" && pathname === "/api/settings")) unexpectedWrites.push({ method, url: request.url() });
  });

  for (const [track, language] of [["jp", "ja-JP"], ["cn", "zh-CN"]] as const) {
    const unitId = await unitWithSpeakingCard(page, track);
    await page.goto(`/speaking/${unitId}`);
    const priorRequests = Number(await page.locator("html").getAttribute("data-microphone-requests") ?? 0);
    await expect(page.locator(".speaking-session")).toHaveAttribute("data-speaking-track", track);
    await expect(page.locator(".speaking-card__reading")).not.toBeEmpty();
    await expect(page.getByRole("button", { name: "참고 음성 듣기" })).toBeEnabled();
    await page.getByRole("button", { name: "참고 음성 듣기" }).click();
    await expect.poll(() => page.locator("html").getAttribute("data-last-reference")).toContain(`"lang":"${language}"`);
    expect(Number(await page.locator("html").getAttribute("data-microphone-requests") ?? 0)).toBe(priorRequests);

    const record = page.getByRole("button", { name: "녹음 시작" });
    await record.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("녹음 중 · 최대 15초")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-microphone-constraints", '{"audio":true}');
    await page.getByRole("button", { name: "녹음 중지" }).click();
    await expect(page.getByLabel("내 녹음 재생")).toHaveAttribute("src", /^blob:/u);
    const created = Number(await page.locator("html").getAttribute("data-clip-urls"));

    await page.getByRole("button", { name: "다시 녹음" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-revoked-clips", String(created));
    await page.getByRole("button", { name: "녹음 중지" }).click();
    await page.getByRole("button", { name: "녹음 삭제" }).click();
    await expect(page.getByLabel("내 녹음 재생")).toHaveCount(0);

    const stopped = Number(await page.locator("html").getAttribute("data-stopped-tracks"));
    await page.getByRole("button", { name: "녹음 시작" }).click();
    await page.getByRole("button", { name: /끝내기 \(Esc\)/u }).click();
    await expect(page.locator(".home-screen")).toBeVisible();
    expect(Number(await page.locator("html").getAttribute("data-stopped-tracks"))).toBe(stopped + 1);
  }

  expect(unexpectedWrites).toEqual([]);
});

test("repeats a card three times and moves between cards by keyboard", async ({ page }) => {
  await page.addInitScript(installSpeakingMocks);

  const unitId = await unitWithTwoSpeakingCards(page, "jp");
  await page.goto(`/speaking/${unitId}`);

  await expect(page.getByText("반복 연습 · 1번째 / 3번")).toBeVisible();
  await expect(page.getByText("3번 반복하면 유창성 연습이 됩니다")).toBeVisible();
  await expect(page.getByRole("button", { name: "참고 음성 듣기" })).toBeVisible();

  await page.getByRole("button", { name: "다시 말하기" }).click();
  await expect(page.getByText("반복 연습 · 2번째 / 3번")).toBeVisible();
  await expect(page.getByRole("button", { name: "참고 음성 다시 듣기" })).toBeVisible();

  await page.getByRole("button", { name: "다시 말하기" }).click();
  await expect(page.getByText("반복 연습 · 3번째 / 3번")).toBeVisible();
  await expect(page.getByText("3번 반복하면 유창성 연습이 됩니다")).toHaveCount(0);

  await page.getByRole("button", { name: "다시 말하기" }).click();
  await expect(page.getByText("반복 연습 · 3번째 / 3번")).toBeVisible();

  const firstCardText = await page.locator(".speaking-card__sentence").textContent();
  await page.locator("body").click();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("반복 연습 · 1번째 / 3번")).toBeVisible();
  await expect(page.locator(".speaking-card__sentence")).not.toHaveText(firstCardText ?? "");

  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".speaking-card__sentence")).toHaveText(firstCardText ?? "");

  await page.keyboard.press(" ");
  await expect.poll(() => page.locator("html").getAttribute("data-last-reference")).toContain('"lang":"ja-JP"');

  await page.keyboard.press("r");
  await expect(page.getByText("녹음 중 · 최대 15초")).toBeVisible();
  await page.keyboard.press("r");
  await expect(page.getByLabel("내 녹음 재생")).toHaveAttribute("src", /^blob:/u);
});
