import { DAILY_GOAL } from "./useSettings";

export function DailyGoal({ goal, onChange }: { goal: number; onChange: (goal: number) => void }) {
  return (
    <section className="settings-card daily-goal-setting">
      <header><span>일일 목표</span><strong>{goal} XP</strong></header>
      <input aria-label="일일 XP 목표" max={DAILY_GOAL.max} min={DAILY_GOAL.min} onChange={(event) => onChange(Number(event.target.value))} step={DAILY_GOAL.step} type="range" value={goal} />
      <footer><span>가볍게 10</span><span>집중 120</span></footer>
    </section>
  );
}
