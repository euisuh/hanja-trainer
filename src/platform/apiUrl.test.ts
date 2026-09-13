import { describe, expect, it } from "vitest";
import { apiUrl } from "./apiUrl";

describe("apiUrl", () => {
  it("keeps same-origin paths when no origin is configured", () => {
    expect(apiUrl("/api/health", undefined)).toBe("/api/health");
    expect(apiUrl("/api/health", "")).toBe("/api/health");
  });

  it("prefixes the configured origin without doubling slashes", () => {
    expect(apiUrl("/api/health", "https://hanja.uiseoya.com")).toBe("https://hanja.uiseoya.com/api/health");
    expect(apiUrl("/api/audio/kr/%E4%B8%80.mp3", "https://hanja.uiseoya.com/")).toBe("https://hanja.uiseoya.com/api/audio/kr/%E4%B8%80.mp3");
  });
});
