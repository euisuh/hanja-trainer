import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { ConversationChunkPayload } from "../shared/api";

const conversation = JSON.parse(readFileSync("e2e/fixtures/talk-unit-response.json", "utf8"));

const progress = {
  units: [
    { id: 1, ord: 1, titleKo: "다시 묻기", goalKo: "상대방에게 다시 말해 달라고 한다", phraseCount: 2, completedPhraseCount: 1, checkin: null },
    { id: 2, ord: 2, titleKo: "인사", goalKo: "상대방에게 인사한다", phraseCount: 1, completedPhraseCount: 0, checkin: null },
  ],
  phrases: [
    { id: 1, unitId: 1, ord: 1, ja: "fixture one", kana: "fixture one", koCue: "다시 말해 달라고 하기", sourceKind: "corpus", sourceRef: "Tatoeba #1", spokenDays: 2, againCount: 0 },
    { id: 2, unitId: 1, ord: 2, ja: "fixture two", kana: "fixture two", koCue: "다시 묻기", sourceKind: "corpus", sourceRef: "Tatoeba #2", spokenDays: 1, againCount: 2 },
    { id: 3, unitId: 2, ord: 1, ja: "fixture three", kana: "fixture three", koCue: "인사하기", sourceKind: "corpus", sourceRef: "Tatoeba #3", spokenDays: 0, againCount: 0 },
  ],
};

test("Talk index supports keyboard navigation and contents progress", async ({ page }) => {
  await page.route("**/api/conv/progress", (route) => route.fulfill({ json: progress }));
  await page.route("**/api/conv/checkins", (route) => route.fulfill({ json: { unitId: 1, at: Date.UTC(2026, 9, 6), note: "카페에서 사용" } }));
  await page.route(/\/api\/conv\/session\?unitId=1/u, (route) => route.fulfill({ json: { unit: conversation.unit, chunks: conversation.chunks, items: conversation.chunks.map((chunk: ConversationChunkPayload) => ({ kind: "chunk", phase: "say", chunk })) } }));
  await page.goto("/talk");
  await expect(page.getByRole("heading", { name: "Index" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/talk\/1$/);
  await expect(page.getByText(conversation.chunks[0].koCue)).toBeVisible();
  await page.goto("/talk");
  await expect(page.getByRole("heading", { name: "Index" })).toBeVisible();
  await page.keyboard.press("c");
  await expect(page.getByRole("heading", { name: "Contents" })).toBeVisible();
  await expect(page.getByText("Weak pages")).toBeVisible();
  await expect(page.getByRole("link", { name: "Tatoeba #1" })).toBeVisible();
  await expect(page.getByLabel("실제로 해봤다").first()).toBeVisible();
  await page.getByLabel("다시 묻기 체크인 메모").fill("카페에서 사용");
  await page.getByLabel("실제로 해봤다").first().click();
  await expect(page.getByLabel("실제로 해봤다").first()).toBeChecked();
  await expect(page.getByLabel("다시 묻기 체크인 메모")).toBeDisabled();
  await expect(page.getByLabel("두 날짜에 말함").locator("svg")).toBeVisible();
});

test("Talk index mobile viewport screenshot", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/conv/progress", (route) => route.fulfill({ json: progress }));
  await page.goto("/talk");
  await expect(page.getByRole("heading", { name: "Index" })).toBeVisible();
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("talk-index-mobile.png") });
});
