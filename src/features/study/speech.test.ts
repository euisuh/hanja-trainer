import { describe, expect, it } from "vitest";
import { matchingVoice, speechLanguages } from "./speech";

describe("study speech voices", () => {
  it("uses only the requested locale and normalizes underscores", () => {
    const voices = [{ lang: "zh-TW" }, { lang: "ja_JP" }, { lang: "ko-KR" }];
    expect(matchingVoice(voices, "jp")).toBe(voices[1]);
    expect(matchingVoice(voices, "kr")).toBe(voices[2]);
    expect(matchingVoice(voices, "cn")).toBeUndefined();
    expect(speechLanguages.cn).toBe("zh-CN");
  });
});
