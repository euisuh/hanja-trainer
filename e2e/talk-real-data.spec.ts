import { expect, test } from "@playwright/test";

// No mocks: this runs against the real seeded conversation units (e2e-setup seeds data/conversation).
test("Talk Index lists the seeded units and a session opens real cards", async ({ page }) => {
  await page.goto("/talk");
  await expect(page.getByRole("heading", { name: "Index" })).toBeVisible();
  await expect(page.getByText("인사와 맞장구").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/talk\/\d+$/u);
  await expect(page.locator(".talk-screen__cue").first()).not.toBeEmpty();
});

test("progress counts phrases per unit and scene attempts are accepted", async ({ page }) => {
  const progress = await (await page.request.get("/api/conv/progress")).json() as { units: Array<{ id: number; phraseCount: number }>; phrases: unknown[] };
  expect(progress.units.length).toBeGreaterThanOrEqual(10);
  expect(progress.units.every((unit) => unit.phraseCount > 0)).toBe(true);

  const unitId = progress.units[0]?.id;
  const session = await (await page.request.get(`/api/conv/session?unitId=${unitId}`)).json() as { items: Array<{ kind: string; scene?: { id: number; turns: Array<{ speaker: string; chunkIds: number[] }> } }>; chunks: Array<{ id: number; role: "say" | "hear" }> };
  expect(session.chunks.length).toBeGreaterThan(0);
  const sceneItem = session.items.find((item) => item.kind === "scene");
  expect(sceneItem?.scene).toBeTruthy();
  const turn = sceneItem?.scene?.turns.find((candidate) => candidate.speaker === "learner");
  const chunk = session.chunks.find((candidate) => candidate.id === turn?.chunkIds[0]);
  expect(chunk).toBeTruthy();
  const response = await page.request.post("/api/conv/attempts", { headers: { "x-hanja-profile-id": "1" }, data: [{ clientAttemptId: `e2e-scene-${Date.now()}`, chunkId: chunk?.id, sceneId: sceneItem?.scene?.id, role: chunk?.role, grade: "good", answeredAt: Date.now(), loop: "roleplay", input: "tap" }] });
  expect(response.status()).toBe(200);
});
