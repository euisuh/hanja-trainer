import { expect, test } from "@playwright/test";

test("self-hosted fonts load without third-party requests", async ({ page }) => {
  const thirdParty: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1")) thirdParty.push(request.url());
  });
  await page.goto("/home");
  await expect(page.locator(".app")).toBeVisible();

  const faces = ["Noto Sans KR Variable", "Noto Serif KR Variable", "Noto Serif JP Variable", "Noto Serif SC Variable"];
  const loaded = await page.evaluate(async (families) => {
    const samples: Record<string, string> = { "Noto Serif JP Variable": "漢字", "Noto Serif SC Variable": "汉字", "Noto Serif KR Variable": "漢字", "Noto Sans KR Variable": "한자" };
    await Promise.all(families.map((family) => document.fonts.load(`700 24px '${family}'`, samples[family] ?? "Aa")));
    // document.fonts.check() is true for unknown families, so require real loaded faces.
    return [...new Set([...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family.replaceAll(/["']/gu, "")))].sort();
  }, faces);
  expect(loaded).toEqual([...faces].sort());
  expect(thirdParty).toEqual([]);
});
