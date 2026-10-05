import { APPEARANCE_IDS, type AppearanceId } from "../../../shared/settings";

const labels: Record<AppearanceId, string> = { classic: "클래식", notebook: "Notebook" };

export function AppearancePicker({ value, onChange }: { value: AppearanceId; onChange: (appearance: AppearanceId) => void }) {
  return (
    <section className="settings-card appearance-picker">
      <header>화면 분위기</header>
      <div>
        {APPEARANCE_IDS.map((appearance) => <button aria-pressed={appearance === value} key={appearance} onClick={() => onChange(appearance)} type="button">{labels[appearance]}</button>)}
      </div>
    </section>
  );
}
