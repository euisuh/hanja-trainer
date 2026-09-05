import { describe, expect, it } from "vitest";
import { themes } from "./tokens";

function luminance(hex: string): number {
  const [red, green, blue] = hex.match(/[\da-f]{2}/giu)!.map((part) => {
    const channel = Number.parseInt(part, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("visual themes", () => {
  it("keeps every existing default token unchanged", () => {
    const current = themes.default;
    expect(current.colors).toMatchObject({
      paper: "#EFEAE0", ink: "#16130F", body: "#4A443B", muted: "#6E675C", faint: "#6F685F",
      card: "#FFFFFF", panel: "#F6F2E9", chipBg: "#F1ECE1", borderTan: "#E2DAC9", gold: "#E8B33D",
      calendarLow: "#FBE7C6", calendarMedium: "#F0B95E", calendarHigh: "#E8873D",
      correct: "#12855A", correctBg: "#E4F6EC", correctFg: "#0E6B48",
      wrong: "#D93A16", wrongBg: "#FCE9E4", wrongFg: "#A42D10",
    });
    expect(current.fonts).toEqual({
      ui: "'Plus Jakarta Sans', 'Noto Sans KR', sans-serif",
      answer: "'Noto Sans KR', sans-serif",
      kr: "'Noto Serif KR', serif", jp: "'Noto Serif JP', serif", cn: "'Noto Serif SC', serif",
    });
    expect(current.tracks).toEqual({
      kr: { accent: "#3B5BDB", accentText: "#3B5BDB", soft: "#EEF1FD", font: current.fonts.kr },
      jp: { accent: "#E14B32", accentText: "#C23F29", soft: "#FDEEEB", font: current.fonts.jp },
      cn: { accent: "#0E9F6E", accentText: "#0B7D56", soft: "#E7F6F0", font: current.fonts.cn },
    });
    expect(current.radii).toEqual({ keycap: "7px", small: "12px", navItem: "15px", medium: "20px", large: "22px", extraLarge: "28px", answer: "18px", answerKey: "9px", panel: "16px", badge: "8px", control: "14px", cta: "24px", modal: "26px", calendar: "4px", chart: "7px 7px 3px 3px", pill: "999px" });
    expect(current.shadows).toEqual({ hard3: "0 3px 0 #16130F", hard4: "0 4px 0 #16130F", hard5: "0 5px 0 #16130F", hard6: "0 6px 0 #16130F", hard7: "0 7px 0 #16130F", nav: "0 6px 24px rgba(22, 19, 15, .32)" });
  });

  it("reproduces Quiet Technical and fixes glyph fonts", () => {
    const quiet = themes["quiet-technical"];
    expect(quiet.colors).toMatchObject({
      paper: "#F7F6F4", ink: "#201F1D", card: "#FFFFFF", panel: "#F5F4F2", chipBg: "#F0EFED",
      borderTan: "#DEDCDA", muted: "#5A5854", faint: "#8A877F", gold: "#B45309", goldHover: "#92400E", goldText: "#FFFFFF",
      calendarLow: "#EEF0F6", calendarMedium: "#4C5F8A", calendarHigh: "#201F1D",
      correct: "#2F7D5A", correctBg: "#EDF6F1", correctFg: "#2F7D5A",
      wrong: "#B0492E", wrongBg: "#FCEFEC", wrongFg: "#B0492E", feedbackBg: "#201F1D", feedbackText: "#F7F6F4",
    });
    expect(quiet.tracks).toMatchObject({
      kr: { accent: "#4C5F8A", soft: "#EEF0F6" }, jp: { accent: "#A85A3D", soft: "#F7EEEA" }, cn: { accent: "#4C7A63", soft: "#EEF5F0" },
    });
    expect(quiet.fonts).toEqual({ ...themes.default.fonts, ui: "'Space Grotesk', system-ui, sans-serif", answer: "'Space Grotesk', system-ui, sans-serif" });
    expect(quiet.radii).toMatchObject({ keycap: "6px", small: "7px", navItem: "8px", medium: "8px", large: "10px", extraLarge: "10px", answer: "8px", answerKey: "6px", panel: "8px", badge: "6px", control: "8px", cta: "10px", modal: "10px", calendar: "6px", pill: "999px" });
    expect(Object.entries(quiet.radii).filter(([name]) => name !== "pill").every(([, value]) => Number.parseInt(value) >= 6 && Number.parseInt(value) <= 10)).toBe(true);
    expect(Object.values(quiet.shadows).slice(0, 5)).toEqual(Array(5).fill("none"));
  });

  it("meets AA for every Quiet Technical text role", () => {
    const { colors, tracks } = themes["quiet-technical"];
    const pairs = [
      [colors.ink, colors.paper], [colors.muted, colors.paper], [colors.faint, colors.ink],
      [colors.goldText, colors.gold], [colors.correctFg, colors.correctBg], [colors.wrongFg, colors.wrongBg],
      [colors.feedbackText, colors.feedbackBg],
      ...Object.values(tracks).flatMap((track) => [[track.accent, colors.card], [track.accentText, track.soft]]),
    ];
    for (const [foreground, background] of pairs) expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
});
