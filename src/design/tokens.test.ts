import { describe, expect, it } from "vitest";
import { avatarHue } from "../features/profile/avatarHue";
import { avatarBackground, theme } from "./tokens";

function relativeLuminance([red, green, blue]: number[]): number {
  const [r, g, b] = [red, green, blue].map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function luminance(hex: string): number {
  return relativeLuminance(hex.match(/[\da-f]{2}/giu)!.map((part) => Number.parseInt(part, 16) / 255));
}

function contrast(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function avatarContrast(hue: number): number {
  const [, saturationValue, lightnessValue] = avatarBackground.match(/ (\d+)% (\d+)%\)$/u)!;
  const saturation = Number(saturationValue) / 100;
  const lightness = Number(lightnessValue) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = hue / 60;
  const middle = chroma * (1 - Math.abs(section % 2 - 1));
  const channels = section < 1 ? [chroma, middle, 0] : section < 2 ? [middle, chroma, 0] : section < 3 ? [0, chroma, middle]
    : section < 4 ? [0, middle, chroma] : section < 5 ? [middle, 0, chroma] : [chroma, 0, middle];
  const offset = lightness - chroma / 2;
  return 1.05 / (relativeLuminance(channels.map((channel) => channel + offset)) + 0.05);
}

describe("visual themes", () => {
  it("keeps white avatar initials legible for every generated hue", () => {
    for (let hue = 0; hue < 360; hue += 1) expect(avatarContrast(hue), `hue ${hue}`).toBeGreaterThanOrEqual(3);
    for (const profileId of [1, 2, 3, 4, 5, 137, 360, 361]) {
      const hue = Number.parseInt(avatarHue(profileId), 10);
      expect(avatarContrast(hue), `profile ${profileId}, hue ${hue}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("defines one Quiet theme with 8px radii, no pills and no shadows", () => {
    expect(theme.colors).toMatchObject({ paper: "#F4F5F6", ink: "#201F1D", card: "#FFFFFF", goldText: "#FFFFFF", feedbackBg: "#201F1D" });
    expect(theme.fonts.ui).toBe("'Noto Sans KR Variable', system-ui, sans-serif");
    expect(theme.tracks).toMatchObject({ kr: { accent: "#5B6B8C" }, jp: { accent: "#A5583C" }, cn: { accent: "#4A7A62" } });
    expect(theme.cssVariables).toMatchObject({ "--paper": theme.colors.paper, "--kr-accent": theme.tracks.kr.accent, "--font-ui": theme.fonts.ui, "--border-width": "1px" });
    expect(Object.keys(theme.cssVariables)).not.toContain("--radius-pill");
    expect(Object.values(theme.radii).every((value) => Number.parseInt(value) <= 8)).toBe(true);
    expect(theme.radii.control).toBe("8px");
  });

  it("meets AA for every text role", () => {
    const { colors, tracks } = theme;
    const pairs = [
      [colors.ink, colors.paper], [colors.muted, colors.paper], [colors.faint, colors.paper], [colors.faint, colors.card],
      [colors.goldText, colors.gold], [colors.goldText, colors.goldHover], [colors.flameText, colors.card], [colors.flameText, colors.paper],
      [colors.correctFg, colors.correctBg], [colors.wrongFg, colors.wrongBg], [colors.feedbackText, colors.feedbackBg],
      ...Object.values(tracks).flatMap((track) => [[track.accentText, track.soft]]),
    ];
    for (const [foreground, background] of pairs) expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
});
