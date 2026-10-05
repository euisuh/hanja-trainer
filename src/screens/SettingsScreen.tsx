/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion -- Existing inline CSS variable bridge is typed at the JSX boundary. */
import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { DailyGoal } from "../features/settings/DailyGoal";
import { OnyomiScript } from "../features/settings/OnyomiScript";
import { ShortcutSheet } from "../features/settings/ShortcutSheet";
import { SoundSetting } from "../features/settings/SoundSetting";
import { TrackToggles } from "../features/settings/TrackToggles";
import { ThemePicker } from "../features/settings/ThemePicker";
import { AppearancePicker } from "../features/settings/AppearancePicker";
import { ProfileSettings } from "../features/settings/ProfileSettings";
import { useSettings } from "../features/settings/useSettings";
import { PinSettings } from "../features/pin/PinSettings";
import { trackThemes } from "../features/tracks/trackTheme";
import type { Track } from "../../shared/types";
import "../features/pin/pin.css";
import "../features/settings/settings.css";

export function SettingsScreen() {
  const navigate = useNavigate();
  const settings = useSettings();
  const [retestError, setRetestError] = useState("");
  async function startRetest(track: Track) {
    try {
      await settings.flush();
      navigate("/placement", { state: { track } });
    } catch {
      setRetestError("트랙 설정을 저장하지 못했습니다. 다시 시도해 주세요.");
    }
  }
  if (!settings.ready) return <p>설정을 불러오는 중…</p>;
  if (settings.error) return <section className="settings-screen"><h1>설정</h1><p role="alert">설정을 불러오지 못했습니다. {settings.error}</p><button onClick={settings.retry} type="button">다시 시도</button></section>;
  return (
    <section className="settings-screen">
      <h1>설정</h1>
      {settings.saveError && <div className="settings-save-error" role="alert"><span>설정을 저장하지 못했습니다. {settings.saveError}</span><button onClick={settings.retrySave} type="button">저장 다시 시도</button></div>}
      <div className="settings-layout">
        <div className="settings-controls">
          <section className="settings-group">
            <h2 className="settings-group__title">학습</h2>
            <TrackToggles enabled={settings.enabledTracks} onToggle={settings.toggle} />
            <OnyomiScript onChange={settings.setOnyomiScript} value={settings.onyomiScript} />
            <DailyGoal goal={settings.dailyGoal} onChange={settings.setGoal} />
          </section>
          <section className="settings-group">
            <h2 className="settings-group__title">화면과 소리</h2>
            <ThemePicker onChange={settings.setTheme} value={settings.theme} />
            <AppearancePicker onChange={settings.setAppearance} value={settings.appearance} />
            <SoundSetting onChange={settings.setSoundMode} value={settings.soundMode} />
          </section>
          <section className="settings-group">
            <h2 className="settings-group__title">계정</h2>
            <section className="settings-card settings-card--action placement-retest">
              <header>레벨 다시 측정</header>
              <div>
                {settings.enabledTracks.map((track) => {
                  const theme = trackThemes[track];
                  return <button key={track} onClick={() => void startRetest(track)} style={{ "--settings-accent": theme.accent, "--settings-accent-text": theme.accentText, "--settings-soft": theme.soft } as CSSProperties} type="button"><span lang={theme.lang}>{theme.label}</span><small>15문항</small></button>;
                })}
              </div>
              <p>커리큘럼별 시작 레벨만 새 결과로 갱신합니다.</p>
              {retestError && <p role="alert">{retestError}</p>}
            </section>
            <PinSettings />
            {settings.isAdmin && <ProfileSettings />}
            <button className="settings-about-link" onClick={() => navigate("/about")} type="button">이 앱에 대해</button>
          </section>
        </div>
        <ShortcutSheet />
      </div>
    </section>
  );
}
