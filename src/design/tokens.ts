const colors = {
  paper: "#F4F5F6", ink: "#201F1D", body: "#4F5459", muted: "#4F5459", faint: "#676C72",
  card: "#FFFFFF", panel: "#F0F1F3", chipBg: "#ECEEF0", borderTan: "#D9DCE0", trackOff: "#D9DCE0",
  dashed: "#C9CDD2", lockedBg: "#ECEEF0", lockedBorder: "#D9DCE0", lockedText: "#4F5459",
  gold: "#2446A8", goldHover: "#1B3785", goldText: "#FFFFFF", flame: "#A5583C", flameText: "#8C432B", goalRemainder: "#4F5459", navMuted: "#C9CDD2",
  keyOverlay: "rgba(0, 0, 0, .28)", calendarLow: "#E6EAF2", calendarMedium: "#5B6B8C", calendarHigh: "#201F1D", shortcutDivider: "#4F5459",
  correct: "#2F7D5A", correctBg: "#EDF6F1", correctFg: "#2F7D5A", correctVivid: "#2F7D5A",
  wrong: "#B0492E", wrongBg: "#FCEFEC", wrongFg: "#B0492E", wrongVivid: "#B0492E", overdue: "#B0492E",
  progressTrack: "#D9DCE0", sessionOverlay: "rgba(32, 31, 29, .72)",
  pulseGold: "rgba(36, 70, 168, .30)", pulseGoldClear: "rgba(36, 70, 168, 0)",
  correctGlow: "rgba(47, 125, 90, .5)", correctGlowClear: "rgba(47, 125, 90, 0)",
  winFlash: "rgba(47, 125, 90, .40)", winFlashClear: "rgba(47, 125, 90, 0)",
  feedbackBg: "#201F1D", feedbackText: "#F4F5F6",
} as const;

const glyphFonts = {
  kr: "'Noto Serif KR Variable', 'Noto Serif KR', serif", jp: "'Noto Serif JP Variable', 'Noto Serif JP', serif", cn: "'Noto Serif SC Variable', 'Noto Serif SC', serif",
} as const;
const fonts = { ui: "'Noto Sans KR Variable', system-ui, sans-serif", answer: "'Noto Sans KR Variable', system-ui, sans-serif", ...glyphFonts } as const;
const tracks = {
  kr: { accent: "#5B6B8C", accentText: "#201F1D", soft: "#ECEFF5", font: glyphFonts.kr },
  jp: { accent: "#A5583C", accentText: "#201F1D", soft: "#F6EEEA", font: glyphFonts.jp },
  cn: { accent: "#4A7A62", accentText: "#201F1D", soft: "#ECF3EF", font: glyphFonts.cn },
} as const;
// One 8px radius everywhere; no pills.
const radii = {
  keycap: "6px", small: "8px", navItem: "8px", medium: "8px", large: "8px", extraLarge: "8px",
  answer: "8px", answerKey: "6px", panel: "8px", badge: "6px", control: "8px", cta: "8px",
  modal: "8px", calendar: "4px", chart: "4px",
} as const;
const shadows = { nav: "none" } as const;

function variables() {
  return {
    "--paper": colors.paper, "--ink": colors.ink, "--body": colors.body, "--muted": colors.muted, "--faint": colors.faint,
    "--card": colors.card, "--panel": colors.panel, "--chip-bg": colors.chipBg, "--border-tan": colors.borderTan,
    "--track-off": colors.trackOff, "--dashed": colors.dashed, "--locked-bg": colors.lockedBg,
    "--locked-border": colors.lockedBorder, "--locked-text": colors.lockedText, "--gold": colors.gold,
    "--gold-hover": colors.goldHover, "--gold-text": colors.goldText, "--flame": colors.flame, "--flame-text": colors.flameText, "--goal-remainder": colors.goalRemainder,
    "--nav-muted": colors.navMuted, "--key-overlay": colors.keyOverlay, "--calendar-low": colors.calendarLow,
    "--calendar-medium": colors.calendarMedium, "--calendar-high": colors.calendarHigh, "--shortcut-divider": colors.shortcutDivider,
    "--correct": colors.correct, "--correct-bg": colors.correctBg, "--correct-fg": colors.correctFg, "--correct-vivid": colors.correctVivid,
    "--wrong": colors.wrong, "--wrong-bg": colors.wrongBg, "--wrong-fg": colors.wrongFg, "--wrong-vivid": colors.wrongVivid, "--overdue": colors.overdue,
    "--progress-track": colors.progressTrack, "--session-overlay": colors.sessionOverlay,
    "--pulse-gold": colors.pulseGold, "--pulse-gold-clear": colors.pulseGoldClear,
    "--correct-glow": colors.correctGlow, "--correct-glow-clear": colors.correctGlowClear,
    "--win-flash": colors.winFlash, "--win-flash-clear": colors.winFlashClear,
    "--feedback-bg": colors.feedbackBg, "--feedback-text": colors.feedbackText,
    "--kr-accent": tracks.kr.accent, "--kr-accent-text": tracks.kr.accentText, "--kr-soft": tracks.kr.soft,
    "--jp-accent": tracks.jp.accent, "--jp-accent-text": tracks.jp.accentText, "--jp-soft": tracks.jp.soft,
    "--cn-accent": tracks.cn.accent, "--cn-accent-text": tracks.cn.accentText, "--cn-soft": tracks.cn.soft,
    "--font-ui": fonts.ui, "--font-answer": fonts.answer, "--font-kr": fonts.kr, "--font-jp": fonts.jp, "--font-cn": fonts.cn,
    "--radius-keycap": radii.keycap, "--radius-small": radii.small, "--radius-nav-item": radii.navItem,
    "--radius-medium": radii.medium, "--radius-large": radii.large, "--radius-extra-large": radii.extraLarge,
    "--radius-answer": radii.answer, "--radius-answer-key": radii.answerKey, "--radius-panel": radii.panel,
    "--radius-badge": radii.badge, "--radius-control": radii.control, "--radius-cta": radii.cta,
    "--radius-modal": radii.modal, "--radius-calendar": radii.calendar, "--radius-chart": radii.chart,
    "--border-width": "1px", "--shadow-nav": shadows.nav,
  } as const;
}

export const theme = { colors, fonts, tracks, radii, shadows, cssVariables: variables() } as const;
export const cssVariables = theme.cssVariables;
export const avatarBackground = "hsl(var(--avatar-hue, 32deg) 58% 38%)";

export { colors };
// Inline component variables resolve through the root custom properties.
export const trackVars = {
  kr: { accent: "var(--kr-accent)", accentText: "var(--kr-accent-text)", soft: "var(--kr-soft)", font: "var(--font-kr)" },
  jp: { accent: "var(--jp-accent)", accentText: "var(--jp-accent-text)", soft: "var(--jp-soft)", font: "var(--font-jp)" },
  cn: { accent: "var(--cn-accent)", accentText: "var(--cn-accent-text)", soft: "var(--cn-soft)", font: "var(--font-cn)" },
} as const;
export { trackVars as tracks };
