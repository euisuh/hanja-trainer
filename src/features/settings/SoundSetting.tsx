import { SOUND_MODES, type SoundMode } from "../../shared/settings";

const labels: Record<SoundMode, string> = { on: "켜기", off: "끄기" };

export function SoundSetting({ value, onChange }: { value: SoundMode; onChange: (mode: SoundMode) => void }) {
  return (
    <section className="settings-card sound-setting">
      <header>소리 피드백</header>
      <div aria-label="소리 피드백" role="group">
        {SOUND_MODES.map((mode) => <button aria-pressed={mode === value} key={mode} onClick={() => onChange(mode)} type="button">{labels[mode]}</button>)}
      </div>
      <small>정답·오답에 짧은 효과음이 재생됩니다.</small>
    </section>
  );
}
