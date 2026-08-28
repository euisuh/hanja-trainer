import { useEffect, useState } from "react";
import { loadOnboardingProfile, SETTINGS_CHANGED_EVENT } from "../features/onboarding/tracks";
import { apiClient, PROFILE_UPDATED_EVENT } from "../lib/apiClient";
import type { ProfileResponse } from "../shared/api";

type Props = { streak?: number; xp?: number; today?: number; goal?: number };

export function goalDegrees(today: number, goal: number): number {
  return goal <= 0 ? 0 : Math.min(360, Math.max(0, 360 * today / goal));
}

export function AppHeader({ streak, xp, today, goal }: Props) {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => void apiClient.profile().then((value) => { if (active) setProfile(value); }).catch(() => undefined);
    refresh();
    window.addEventListener(SETTINGS_CHANGED_EVENT, refresh);
    window.addEventListener(PROFILE_UPDATED_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(SETTINGS_CHANGED_EVENT, refresh);
      window.removeEventListener(PROFILE_UPDATED_EVENT, refresh);
    };
  }, []);
  const dailyGoal = goal ?? profile?.goal ?? loadOnboardingProfile().dailyGoal;
  const todayXp = today ?? profile?.todayXp ?? 0;
  const totalXp = xp ?? profile?.xp ?? 0;
  const degrees = goalDegrees(todayXp, dailyGoal);
  const currentStreak = streak ?? profile?.streak ?? 0;
  return (
    <header className="app-header" aria-label="오늘의 학습 현황">
      <div className="metric">
        <svg aria-hidden="true" className="metric__flame" height="15" viewBox="0 0 24 24" width="15"><path d="M12 2c1 4-3 5-3 9a3 3 0 006 0c0-1-1-2-1-3 2 1 4 4 4 7a6 6 0 01-12 0C6 9 12 8 12 2z" /></svg>
        <strong>{currentStreak}</strong><span>연속</span>
      </div>
      <div className="metric">
        <svg aria-hidden="true" className="metric__bolt" height="14" viewBox="0 0 24 24" width="14"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" /></svg>
        <strong>{totalXp.toLocaleString()}</strong><span>XP</span>
      </div>
      <div className="daily-goal">
        <span className="daily-goal__ring" role="img" aria-label={`일일 목표 ${Math.round(degrees / 3.6)}% 달성`} style={{ "--goal-degrees": `${degrees}deg` } as React.CSSProperties} />
        <strong>오늘 {todayXp}/{dailyGoal} XP</strong>
      </div>
    </header>
  );
}
