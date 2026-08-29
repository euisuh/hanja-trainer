export const DEFAULT_DAILY_GOAL = 40;
export const DAILY_GOAL = { min: 10, max: 120, step: 10 } as const;
export const ONYOMI_SCRIPTS = ["katakana", "hiragana"] as const;
export type OnyomiScript = (typeof ONYOMI_SCRIPTS)[number];

export function normalizeDailyGoal(value: number): number {
  const stepped = Math.round(value / DAILY_GOAL.step) * DAILY_GOAL.step;
  return Math.max(DAILY_GOAL.min, Math.min(DAILY_GOAL.max, stepped));
}
