import { DailyGoal } from "../features/settings/DailyGoal";
import { ShortcutSheet } from "../features/settings/ShortcutSheet";
import { TrackToggles } from "../features/settings/TrackToggles";
import { useSettings } from "../features/settings/useSettings";
import "../features/settings/settings.css";

export function SettingsScreen() {
  const settings = useSettings();
  return (
    <section className="settings-screen">
      <h1>설정</h1>
      <div className="settings-layout">
        <ShortcutSheet />
        <div className="settings-controls">
          <TrackToggles enabled={settings.enabledTracks} onToggle={settings.toggle} />
          <DailyGoal goal={settings.dailyGoal} onChange={settings.setGoal} />
        </div>
      </div>
    </section>
  );
}
