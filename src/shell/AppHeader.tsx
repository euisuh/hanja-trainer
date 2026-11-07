import { useEffect, useState } from "react";
import { useActiveProfile } from "../features/profile/ProfileContext";
import { apiClient, PROFILE_UPDATED_EVENT, validProfileResponse } from "../lib/apiClient";
import type { ProfileResponse } from "../../shared/api";

type Props = { streak?: number; xp?: number; today?: number; goal?: number; onSwitch?: () => void };

export function goalDegrees(today: number, goal: number): number {
  return goal <= 0 ? 0 : Math.min(360, Math.max(0, 360 * today / goal));
}

export function AppHeader({ streak, xp, today, goal, onSwitch }: Props) {
  const activeProfile = useActiveProfile();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  useEffect(() => {
    let active = true;
    let version = 0;
    const refresh = () => {
      const requested = ++version;
      void apiClient.profile().then((value) => {
        if (active && requested === version && value.id === activeProfile.id) setProfile(value);
      }).catch(() => undefined);
    };
    const update = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        refresh();
        return;
      }
      if (!validProfileResponse(event.detail, activeProfile.id)) return;
      version += 1;
      setProfile(event.detail);
    };
    refresh();
    window.addEventListener(PROFILE_UPDATED_EVENT, update);
    return () => {
      active = false;
      window.removeEventListener(PROFILE_UPDATED_EVENT, update);
    };
  }, [activeProfile.id]);
  const dailyGoal = goal ?? profile?.goal ?? 40;
  const todayXp = today ?? profile?.todayXp ?? 0;
  const totalXp = xp ?? profile?.xp ?? 0;
  const progress = goalDegrees(todayXp, dailyGoal) / 360;
  const circumference = 2 * Math.PI * 11.5;
  const currentStreak = streak ?? profile?.streak ?? 0;
  return (
    <header className="app-header" aria-label="오늘의 학습 현황">
      <div className="active-profile">
        <strong>{profile?.name ?? activeProfile.name}</strong>
        {onSwitch && <button onClick={onSwitch} type="button">프로필 전환</button>}
      </div>
      <div className="metric metric--streak">
        <svg aria-hidden="true" className="metric__flame" height="15" viewBox="0 0 24 24" width="15"><path d="M12 2c1 4-3 5-3 9a3 3 0 006 0c0-1-1-2-1-3 2 1 4 4 4 7a6 6 0 01-12 0C6 9 12 8 12 2z" /></svg>
        <strong>{currentStreak}</strong><span>연속</span>
      </div>
      <div className="metric">
        <svg aria-hidden="true" className="metric__bolt" height="14" viewBox="0 0 24 24" width="14"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" /></svg>
        <strong>{totalXp.toLocaleString()}</strong><span>XP</span>
      </div>
      <div className={`daily-goal${todayXp >= dailyGoal ? " daily-goal--met" : ""}`}>
        <svg aria-label={`일일 목표 ${Math.round(progress * 100)}% 달성`} className="daily-goal__ring" role="img" viewBox="0 0 26 26"><circle cx="13" cy="13" r="11.5" fill="none" stroke="var(--goal-remainder)" strokeWidth="3" /><circle cx="13" cy="13" r="11.5" fill="none" stroke="var(--goal-ring-fill)" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} strokeLinecap="round" strokeWidth="3" /></svg>
        <strong>오늘 {todayXp}/{dailyGoal} XP</strong>
      </div>
    </header>
  );
}
