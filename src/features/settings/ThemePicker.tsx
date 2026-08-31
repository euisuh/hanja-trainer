import { THEME_IDS, type ThemeId } from "../../shared/settings";

const labels: Record<ThemeId, string> = { default: "기본", "quiet-technical": "Quiet Technical" };

export function ThemePicker({ value, onChange }: { value: ThemeId; onChange: (theme: ThemeId) => void }) {
  return (
    <section className="settings-card theme-picker">
      <header>화면 스타일</header>
      <div>
        {THEME_IDS.map((theme) => <button aria-pressed={theme === value} key={theme} onClick={() => onChange(theme)} type="button">{labels[theme]}</button>)}
      </div>
    </section>
  );
}
