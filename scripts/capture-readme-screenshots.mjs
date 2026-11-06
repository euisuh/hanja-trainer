/* global process, console, window, document, navigator, Blob, Event, HTMLMediaElement */
// Captures the README screenshots from a LOCAL dev server through the public demo flow.
//
// Usage (local D1 only, never remote):
//   npx wrangler d1 migrations apply hanja --local && npm run seed:local
//   # The landing page only shows when the admin profile has a PIN:
//   npm run dev -- --port 8799        # in another terminal, then set an admin PIN in the app
//   node scripts/capture-readme-screenshots.mjs [--base http://127.0.0.1:8799] [--out docs/screenshots]
//   (needs system Chrome or `npx playwright install chromium`; `cwebp` on PATH for WebP output)
//
// Writes <name>-desktop.png (1440x900) and <name>-mobile.png (390x844) into --out, then converts
// them to WebP (`cwebp -q 82`) and deletes the PNGs. One demo session is created per run (the API
// allows 5 per hour per client). Microphone and speech recognition are stubbed in the browser so
// the shadowing panel shows a feedback result headlessly; no audio is recorded or sent anywhere.
// FIXTURE DATA: after the guest session exists, the script inserts about three weeks of varied past
// study (review_log, sessions, review_states) for that guest profile into the LOCAL D1 database
// (`wrangler d1 execute hanja --local`) so the stats heatmap, streak and mastery bars look like real
// use. It is made-up data for screenshots only and never touches a remote database.
// The script refuses any base URL that is not localhost.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const base = opt("base", "http://127.0.0.1:8799").replace(/\/$/u, "");
const out = opt("out", "docs/screenshots");
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/u.test(base)) throw new Error("capture runs against a local dev server only");
mkdirSync(out, { recursive: true });

const viewports = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const talkUnit = { desktop: 2, mobile: 4 };
const pause = (page, ms = 700) => page.waitForTimeout(ms);

// Stubs: a recorder that "records" on start/stop and a recognizer that returns window.__heard.
function installStubs() {
  class Recorder {
    state = "inactive"; mimeType = "audio/webm"; ondataavailable = null; onerror = null; onstop = null;
    static isTypeSupported() { return true; }
    start() { this.state = "recording"; }
    stop() { if (this.state === "inactive") return; this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["x"], { type: this.mimeType }) }); this.onstop?.(new Event("stop")); }
  }
  class Recognition {
    lang = ""; interimResults = false; maxAlternatives = 1; onresult = null; onerror = null; onend = null;
    start() {}
    stop() { this.onresult?.({ results: [[{ transcript: window.__heard ?? "" }]] }); this.onend?.(); }
    abort() {}
  }
  Object.defineProperty(window, "MediaRecorder", { configurable: true, value: Recorder });
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: Recognition });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
  HTMLMediaElement.prototype.play = () => Promise.resolve();
}

async function shot(page, name, kind) {
  await pause(page, 900);
  await page.screenshot({ path: join(out, `${name}-${kind}.png`) });
  console.log("captured", `${name}-${kind}`);
}

const d1 = (...extra) => execFileSync("npx", ["wrangler", "d1", "execute", "hanja", "--local", ...extra], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

// Fixture: 21 days of past guest study with a few rest days; the last four days form a streak.
function seedHistory() {
  const guest = "(SELECT MAX(id) FROM profile WHERE is_demo = 1)";
  const ids = JSON.parse(d1("--json", "--command", `SELECT character_id AS id FROM character_tracks WHERE track = 'jp' AND character_id NOT IN (SELECT character_id FROM review_states WHERE profile_id = ${guest}) ORDER BY character_id LIMIT 60 OFFSET 20`))[0].results.map((row) => row.id);
  const now = Date.now();
  const day = 86_400_000;
  const rest = new Set([5, 6, 11, 12, 17]);
  const sql = [];
  ids.forEach((id, index) => {
    const stability = index % 3 === 2 ? 4 : 12; // two thirds count as mastered (stability >= 7 days)
    const due = now + (3 + (index % 8)) * day;
    sql.push(`INSERT OR IGNORE INTO review_states (profile_id, character_id, track, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, due, correct_count, total_count) VALUES (${guest}, ${id}, 'jp', ${stability}, 5, 3, 7, 0, 4, 0, 2, ${now - 3 * day}, ${due}, 4, 5);`);
  });
  for (let back = 1; back <= 21; back += 1) {
    if (rest.has(back)) continue;
    const count = 6 + ((back * 7) % 17);
    const start = now - back * day - 3_600_000;
    let correct = 0;
    for (let card = 0; card < count; card += 1) {
      const right = (card * 5 + back) % 5 !== 0; // roughly 80 percent correct
      correct += right ? 1 : 0;
      sql.push(`INSERT INTO review_log (profile_id, character_id, track, rating, answered_at, correct, elapsed_ms, scheduled_days_before, scheduled_days_after, mode, session_id, card_index, skipped) VALUES (${guest}, ${ids[(back * 3 + card) % ids.length]}, 'jp', ${right ? 3 : 1}, ${start + card * 9_000}, ${right ? 1 : 0}, ${2_000 + ((card * 731) % 4_000)}, 1, ${right ? 3 : 1}, 'review', 'fixture-${back}', ${card}, 0);`);
    }
    sql.push(`INSERT INTO sessions (profile_id, mode, started_at, ended_at, answered, correct, best_combo, xp, skipped) VALUES (${guest}, 'review', ${start}, ${start + count * 9_000}, ${count}, ${correct}, ${Math.min(count, 4 + (back % 6))}, ${correct * 2}, 0);`);
  }
  const file = join(tmpdir(), "readme-history-fixture.sql");
  writeFileSync(file, sql.join("\n"));
  d1("--file", file);
  rmSync(file, { force: true });
}

async function lesson(page) {
  await page.goto(`${base}/home`);
  await page.getByRole("button", { name: /레슨 시작/u }).click();
  await page.waitForURL("**/lesson");
  // Wrong answers add recall-correction cards; keep answering until the session ends.
  for (let step = 0; step < 60 && page.url().endsWith("/lesson"); step += 1) {
    await page.keyboard.press(String((step % 4) + 1)); // mixed right and wrong answers
    await pause(page, 300);
    await page.keyboard.press("Enter");
    await pause(page, 400);
  }
  console.log("lesson ended at", page.url());
  await pause(page, 1500);
}

// Rates every chunk of a unit "good" through the keyboard; optional shots before and after the first card.
async function talk(page, unit, shots) {
  await page.goto(`${base}/talk/${unit}`);
  await page.getByRole("button", { name: /정답 공개/u }).waitFor({ timeout: 8000 }).catch(async () => { console.log(await page.locator("body").innerText()); throw new Error(`talk unit ${unit} not ready`); });
  if (shots) {
    await page.keyboard.press("Space");
    await page.getByRole("button", { name: /따라 말하기/u }).click();
    await page.getByRole("button", { name: "녹음 시작" }).click();
    await page.evaluate(() => {
      const kana = (document.querySelector(".talk-screen__answer span[lang=ja]")?.textContent ?? "").replace(/[。、？！]/gu, "");
      const drop = Math.floor(kana.length / 2);
      window.__heard = kana.slice(0, drop) + kana.slice(drop + 1); // drop one kana to show a diff
    });
    await page.getByRole("button", { name: "녹음 중지" }).click();
    await page.getByText(/비교 \d+%/u).waitFor();
    await shot(page, "talk-shadow", shots);
    await page.getByRole("button", { name: "닫기" }).click();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
  }
  for (let guard = 0; guard < 40; guard += 1) {
    if (await page.getByText("장면 시작").first().isVisible().catch(() => false)) break;
    if (await page.getByText("오늘 Talk 완료").isVisible().catch(() => false)) return;
    if (await page.getByRole("button", { name: /정답 공개/u }).isVisible().catch(() => false)) {
      await page.keyboard.press("Space");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Enter");
    }
    await pause(page, 350);
  }
  if (shots) await sceneShots(page, shots);
}

// Walks the role-play until the learner line is revealed next to the partner's line.
async function sceneShots(page, kind) {
  await page.getByRole("button", { name: "장면 시작" }).click();
  for (let step = 0; step < 10 && !(await page.locator(".talk-scene__target").isVisible()); step += 1) {
    await pause(page, 500);
    for (const name of ["바로", "말했어요", "다음"]) {
      const button = page.getByRole("button", { name: new RegExp(`^${name}`, "u") });
      if (await button.isVisible().catch(() => false)) { await button.click(); break; }
    }
  }
  await shot(page, "talk-scene", kind);
}

const launch = () => chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const browser2 = launch;
const browser = await launch();
try {
  // Landing, before any session exists.
  for (const [kind, device] of Object.entries(viewports)) {
    const context = await browser.newContext(device);
    const page = await context.newPage();
    await page.goto(`${base}/`);
    await page.getByRole("button", { name: "Continue as guest" }).waitFor();
    await shot(page, "landing", kind);
    await page.getByRole("button", { name: "Sign in" }).click();
    await shot(page, "signin-guest", kind);
    await page.goto(`${base}/`);
    await page.getByRole("button", { name: "Continue as guest" }).waitFor();
    if (kind === "desktop") {
      // One demo session for the whole run: set up learner state once, then reuse it on mobile.
      await page.getByRole("button", { name: "Continue as guest" }).click();
      await page.waitForURL("**/home");
      await page.addInitScript(installStubs);
      await lesson(page);
      await talk(page, 1);
      seedHistory();
      d1("--command",
        "UPDATE review_states SET due = (CAST(strftime('%s', 'now') AS INTEGER) - 3600) * 1000 WHERE reps < 4 AND profile_id IN (SELECT id FROM profile WHERE is_demo = 1)");
      await context.storageState({ path: join(out, ".state.json") });
    }
    await context.close();
  }

  for (const [kind, device] of Object.entries(viewports)) {
    const context = await browser.newContext({ ...device, storageState: join(out, ".state.json") });
    await context.addInitScript(installStubs);
    const page = await context.newPage();
    await page.goto(`${base}/home`);
    await shot(page, "home", kind);
    await page.goto(`${base}/review`);
    await shot(page, "review", kind);
    await page.goto(`${base}/stats`);
    // Grow the viewport to the page height so the fixed bottom nav does not cover the mastery card.
    await pause(page, 1200);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: device.viewport.width, height: Math.max(device.viewport.height, height + 90) });
    // On a phone the 18-week grid scrolls sideways; show its newest weeks.
    await page.evaluate(() => { for (const el of document.querySelectorAll("*")) if (el.scrollWidth > el.clientWidth + 4 && el !== document.documentElement && el !== document.body) el.scrollLeft = el.scrollWidth; });
    await shot(page, "stats", kind);
    await page.setViewportSize(device.viewport);
    await page.goto(`${base}/talk/contents`);
    await shot(page, "talk-contents", kind);
    await talk(page, talkUnit[kind], kind);
    await context.close();
  }

  // Three-reading card last: it needs all tracks on, which changes the home map default.
  const context = await browser.newContext({ ...viewports.desktop, storageState: join(out, ".state.json") });
  const page = await context.newPage();
  await page.goto(`${base}/settings`);
  for (const label of ["한자 · 급수", "汉字 · HSK"]) { await page.getByText(label, { exact: true }).click(); await pause(page, 500); }
  await context.storageState({ path: join(out, ".state.json") });
  await context.close();
  for (const [kind, device] of Object.entries(viewports)) {
    const mobileContext = await browser.newContext({ ...device, storageState: join(out, ".state.json") });
    const detail = await mobileContext.newPage();
    await detail.goto(`${base}/detail/%E6%97%A5`);
    await pause(detail, 1200);
    const height = await detail.evaluate(() => document.documentElement.scrollHeight);
    await detail.setViewportSize({ width: device.viewport.width, height: Math.max(device.viewport.height, height + 90) });
    await shot(detail, "three-readings", kind);
    await mobileContext.close();
  }
} finally {
  await browser.close();
  rmSync(join(out, ".state.json"), { force: true });
}

// Hero: desktop landing beside a phone frame with the shadowing panel.
{
  const b64 = (name) => readFileSync(join(out, name)).toString("base64");
  const page = await (await browser2()).newPage({ viewport: { width: 1600, height: 860 } });
  await page.setContent(`<body style="margin:0;background:#e9ecf1;display:flex;align-items:center;justify-content:center;gap:56px;height:860px">
    <img src="data:image/png;base64,${b64("landing-desktop.png")}" style="width:1020px;border:1px solid #b9c0cc;border-radius:10px;box-shadow:0 12px 32px #0002">
    <img src="data:image/png;base64,${b64("talk-shadow-mobile.png")}" style="height:780px;border:10px solid #1f2328;border-radius:38px;box-shadow:0 12px 32px #0003"></body>`);
  await page.screenshot({ path: join(out, "hero.png") });
  await page.context().browser().close();
}

for (const file of readdirSync(out).filter((name) => name.endsWith(".png"))) {
  const webp = join(out, file.replace(/\.png$/u, ".webp"));
  execFileSync("cwebp", ["-quiet", "-q", "82", join(out, file), "-o", webp]);
  rmSync(join(out, file));
}
console.log("done");
