import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesheet = await readFile(fileURLToPath(new URL("./talk.css", import.meta.url)), "utf8");
const talkCss = (await Promise.all(["talk", "talkHome", "talkDiary"].map((name) => readFile(fileURLToPath(new URL(`../features/conversation/${name}.css`, import.meta.url)), "utf8")))).join("\n");

function tokenBlock(selector: string): Record<string, string> {
  const tokens = stylesheet.match(new RegExp(`${selector}\\s*\\{(?<tokens>[^}]*)\\}`, "u"))?.groups?.tokens ?? "";
  return Object.fromEntries([...tokens.matchAll(/(?<name>--[\w-]+):\s*(?<value>[^;]+);/gu)].map(({ groups }) => [groups!.name, groups!.value.trim()]));
}

describe("Talk tokens", () => {
  it("aliases the shared Quiet tokens under the Talk root", () => {
    expect(tokenBlock("\\.talk-root")).toMatchObject({
      "--talk-paper": "var(--paper)", "--talk-ink": "var(--ink)", "--talk-muted": "var(--muted)",
      "--talk-font-jp": "var(--font-jp)", "--talk-font-ui": "var(--font-ui)",
    });
  });

  it("has no ruled-line backgrounds or monospace labels", () => {
    expect(talkCss).not.toMatch(/gradient|monospace|font-meta/u);
  });
});
