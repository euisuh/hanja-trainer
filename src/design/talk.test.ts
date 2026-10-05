import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesheet = await readFile(fileURLToPath(new URL("./talk.css", import.meta.url)), "utf8");

function tokenBlock(selector: string): Record<string, string> {
  const tokens = stylesheet.match(new RegExp(`${selector}\\s*\\{(?<tokens>[^}]*)\\}`, "u"))?.groups?.tokens ?? "";
  return Object.fromEntries([...tokens.matchAll(/(?<name>--[\w-]+):\s*(?<value>[^;]+);/gu)].map(({ groups }) => [groups!.name, groups!.value.trim()]));
}

const expected = {
  light: {
    "--talk-paper": "#FBF8F1", "--talk-ruled-line": "#D5E0EA", "--talk-ink": "#1F2A44", "--talk-muted": "#5C6478",
    "--talk-pencil-red": "#C2412D", "--talk-highlighter": "#FFE58A", "--talk-tab-green": "#2E6F5E",
  },
  dark: {
    "--talk-paper": "#181A20", "--talk-ruled-line": "#2A3140", "--talk-ink": "#E6E8EE", "--talk-muted": "#9AA2B5",
    "--talk-pencil-red": "#F0806B", "--talk-highlighter": "#5A4B12", "--talk-tab-green": "#6DBBA4",
  },
};

describe("Talk Notebook tokens", () => {
  it("defines the approved light and dark colors under the Talk root", () => {
    expect(tokenBlock("\\.talk-root")).toMatchObject(expected.light);
    expect(tokenBlock('\\.talk-root\\[data-talk-theme="dark"\\]')).toMatchObject(expected.dark);
  });

  it("defines the Talk font roles under the Talk root", () => {
    expect(tokenBlock("\\.talk-root")).toMatchObject({
      "--talk-font-jp": '"Klee One", "Noto Serif JP Variable", serif',
      "--talk-font-reading": '"Zen Maru Gothic", "Noto Sans JP", sans-serif',
      "--talk-font-ui": '"IBM Plex Sans KR", "Noto Sans KR Variable", sans-serif',
      "--talk-font-meta": '"IBM Plex Mono", ui-monospace, monospace',
    });
  });
});
