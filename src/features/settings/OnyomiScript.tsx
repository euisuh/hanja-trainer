import { ONYOMI_SCRIPTS, type OnyomiScript as OnyomiScriptValue } from "../../../shared/settings";

const options = {
  katakana: { label: "가타카나", sample: "イチ・イツ" },
  hiragana: { label: "히라가나", sample: "いち・いつ" },
} as const;

export function OnyomiScript({ value, onChange }: { value: OnyomiScriptValue; onChange: (value: OnyomiScriptValue) => void }) {
  return (
    <section className="settings-card onyomi-script-setting">
      <header><span>音読み 표기</span><small>漢字 트랙 전용</small></header>
      <div aria-label="音読み 표기" role="group">
        {ONYOMI_SCRIPTS.map((script) => <button aria-pressed={value === script} key={script} onClick={() => onChange(script)} type="button"><span>{options[script].label}</span><strong>{options[script].sample}</strong></button>)}
      </div>
    </section>
  );
}
