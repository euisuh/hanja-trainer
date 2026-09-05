const defaultColors = {
  paper: "#EFEAE0", ink: "#16130F", body: "#4A443B", muted: "#6E675C", faint: "#6F685F",
  card: "#FFFFFF", panel: "#F6F2E9", chipBg: "#F1ECE1", borderTan: "#E2DAC9", trackOff: "#D8D0BE",
  dashed: "#C4B9A4", lockedBg: "#E6DFCF", lockedBorder: "#D3C9B4", lockedText: "#686154",
  gold: "#E8B33D", goldHover: "#D19A22", goldText: "#16130F", flame: "#E8873D", goalRemainder: "#3B372F", navMuted: "#C9C0B2",
  keyOverlay: "rgba(0, 0, 0, .28)", calendarLow: "#FBE7C6", calendarMedium: "#F0B95E", calendarHigh: "#E8873D", shortcutDivider: "#2B2721",
  correct: "#3DAE28", correctBg: "#E9F8E2", correctFg: "#2A7A1B", correctVivid: "#58CC02",
  wrong: "#E33B3B", wrongBg: "#FDEAEA", wrongFg: "#B32020", wrongVivid: "#FF4B4B",
  overdue: "#C2410C", progressTrack: "#DFD7C6", sessionOverlay: "rgba(22, 19, 15, .72)",
  pulseGold: "rgba(232, 179, 61, .55)", pulseGoldClear: "rgba(232, 179, 61, 0)",
  correctGlow: "rgba(47, 125, 90, .35)", correctGlowClear: "rgba(47, 125, 90, 0)",
  winFlash: "rgba(88, 204, 2, .45)", winFlashClear: "rgba(88, 204, 2, 0)",
  feedbackBg: "#F6F2E9", feedbackText: "#4A443B",
} as const;

const glyphFonts = {
  kr: "'Noto Serif KR', serif", jp: "'Noto Serif JP', serif", cn: "'Noto Serif SC', serif",
} as const;
const defaultFonts = { ui: "'Plus Jakarta Sans', 'Noto Sans KR', sans-serif", answer: "'Noto Sans KR', sans-serif", ...glyphFonts } as const;
const defaultTracks = {
  kr: { accent: "#3B5BDB", accentText: "#3B5BDB", soft: "#EEF1FD", font: glyphFonts.kr },
  jp: { accent: "#C23F29", accentText: "#C23F29", soft: "#FDEEEB", font: glyphFonts.jp },
  cn: { accent: "#0B7D56", accentText: "#0B7D56", soft: "#E7F6F0", font: glyphFonts.cn },
} as const;
const defaultRadii = {
  keycap: "7px", small: "12px", navItem: "15px", medium: "20px", large: "22px", extraLarge: "28px",
  answer: "18px", answerKey: "9px", panel: "16px", badge: "8px", control: "14px", cta: "24px",
  modal: "26px", calendar: "4px", chart: "7px 7px 3px 3px", pill: "999px",
} as const;
const defaultShadows = {
  hard3: `0 3px 0 ${defaultColors.ink}`, hard4: `0 4px 0 ${defaultColors.ink}`,
  hard5: `0 5px 0 ${defaultColors.ink}`, hard6: `0 6px 0 ${defaultColors.ink}`,
  hard7: `0 7px 0 ${defaultColors.ink}`, nav: "0 6px 24px rgba(22, 19, 15, .32)",
} as const;

const quietColors = {
  ...defaultColors,
  paper: "#F7F6F4", ink: "#201F1D", body: "#5A5854", muted: "#5A5854", faint: "#8A877F",
  card: "#FFFFFF", panel: "#F5F4F2", chipBg: "#F0EFED", borderTan: "#DEDCDA", trackOff: "#DEDCDA",
  dashed: "#DEDCDA", lockedBg: "#F0EFED", lockedBorder: "#DEDCDA", lockedText: "#5A5854",
  gold: "#B45309", goldHover: "#92400E", goldText: "#FFFFFF", flame: "#B45309", goalRemainder: "#DEDCDA", navMuted: "#DEDCDA",
  calendarLow: "#EEF0F6", calendarMedium: "#4C5F8A", calendarHigh: "#201F1D", shortcutDivider: "#5A5854",
  correct: "#2F7D5A", correctBg: "#EDF6F1", correctFg: "#2F7D5A", correctVivid: "#3DAE28",
  wrong: "#B0492E", wrongBg: "#FCEFEC", wrongFg: "#B0492E", wrongVivid: "#D14A4A", overdue: "#B0492E",
  progressTrack: "#DEDCDA", sessionOverlay: "rgba(32, 31, 29, .72)",
  pulseGold: "rgba(180, 83, 9, .35)", pulseGoldClear: "rgba(180, 83, 9, 0)",
  correctGlow: "rgba(47, 125, 90, .5)", correctGlowClear: "rgba(47, 125, 90, 0)",
  winFlash: "rgba(47, 125, 90, .40)", winFlashClear: "rgba(47, 125, 90, 0)",
  feedbackBg: "#201F1D", feedbackText: "#F7F6F4",
} as const;
const quietFonts = { ui: "'Space Grotesk', system-ui, sans-serif", answer: "'Space Grotesk', system-ui, sans-serif", ...glyphFonts } as const;
const quietTracks = {
  kr: { accent: "#4C5F8A", accentText: quietColors.ink, soft: "#EEF0F6", font: glyphFonts.kr },
  jp: { accent: "#A85A3D", accentText: quietColors.ink, soft: "#F7EEEA", font: glyphFonts.jp },
  cn: { accent: "#4C7A63", accentText: quietColors.ink, soft: "#EEF5F0", font: glyphFonts.cn },
} as const;
const quietRadii = {
  keycap: "6px", small: "7px", navItem: "8px", medium: "8px", large: "10px", extraLarge: "10px",
  answer: "8px", answerKey: "6px", panel: "8px", badge: "6px", control: "8px", cta: "10px",
  modal: "10px", calendar: "6px", chart: "6px", pill: "999px",
} as const;
const quietShadows = {
  hard3: "none", hard4: "none", hard5: "none", hard6: "none", hard7: "none",
  nav: "0 1px 2px rgba(0,0,0,.04)",
} as const;

type ThemeTokens = {
  colors: typeof defaultColors | typeof quietColors;
  fonts: typeof defaultFonts | typeof quietFonts;
  tracks: typeof defaultTracks | typeof quietTracks;
  radii: typeof defaultRadii | typeof quietRadii;
  shadows: typeof defaultShadows | typeof quietShadows;
  borderWidth: string;
};

function variables({ colors, fonts, tracks, radii, shadows, borderWidth }: ThemeTokens) {
  return {
    "--paper": colors.paper, "--ink": colors.ink, "--body": colors.body, "--muted": colors.muted, "--faint": colors.faint,
    "--card": colors.card, "--panel": colors.panel, "--chip-bg": colors.chipBg, "--border-tan": colors.borderTan,
    "--track-off": colors.trackOff, "--dashed": colors.dashed, "--locked-bg": colors.lockedBg,
    "--locked-border": colors.lockedBorder, "--locked-text": colors.lockedText, "--gold": colors.gold,
    "--gold-hover": colors.goldHover, "--gold-text": colors.goldText, "--flame": colors.flame, "--goal-remainder": colors.goalRemainder,
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
    "--radius-pill": radii.pill, "--border-width": borderWidth,
    "--shadow-3": shadows.hard3, "--shadow-4": shadows.hard4, "--shadow-5": shadows.hard5,
    "--shadow-6": shadows.hard6, "--shadow-7": shadows.hard7, "--shadow-nav": shadows.nav,
  } as const;
}

function theme(tokens: ThemeTokens) { return { ...tokens, cssVariables: variables(tokens) }; }

export const themes = {
  default: theme({ colors: defaultColors, fonts: defaultFonts, tracks: defaultTracks, radii: defaultRadii, shadows: defaultShadows, borderWidth: "3px" }),
  "quiet-technical": theme({ colors: quietColors, fonts: quietFonts, tracks: quietTracks, radii: quietRadii, shadows: quietShadows, borderWidth: "1px" }),
} as const;

export const colors = themes.default.colors;
export const fonts = themes.default.fonts;
export const radii = themes.default.radii;
export const shadows = themes.default.shadows;
export const cssVariables = themes.default.cssVariables;

// Inline component variables resolve through the active root theme.
export const tracks = {
  kr: { accent: "var(--kr-accent)", accentText: "var(--kr-accent-text)", soft: "var(--kr-soft)", font: "var(--font-kr)" },
  jp: { accent: "var(--jp-accent)", accentText: "var(--jp-accent-text)", soft: "var(--jp-soft)", font: "var(--font-jp)" },
  cn: { accent: "var(--cn-accent)", accentText: "var(--cn-accent-text)", soft: "var(--cn-soft)", font: "var(--font-cn)" },
} as const;
