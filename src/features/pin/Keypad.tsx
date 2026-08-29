import { useEffect, useRef } from "react";

type KeypadProps = {
  value: string;
  onChange: (value: string) => void;
  onComplete: (value: string) => void;
  disabled?: boolean;
  shakeKey?: number;
};

export function Keypad({ value, onChange, onComplete, disabled = false, shakeKey = 0 }: KeypadProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, [shakeKey]);

  function append(digit: string) {
    if (disabled || value.length === 4) return;
    const next = value + digit;
    onChange(next);
    if (next.length === 4) onComplete(next);
  }

  function remove() {
    if (!disabled) onChange(value.slice(0, -1));
  }

  return (
    <div
      aria-label={`PIN 키패드, 4자리 중 ${value.length}자리 입력됨`}
      className={`pin-keypad${shakeKey ? " pin-keypad--shake" : ""}`}
      onKeyDown={(event) => {
        if (/^\d$/u.test(event.key)) { event.preventDefault(); append(event.key); }
        else if (event.key === "Backspace") { event.preventDefault(); remove(); }
        else if (event.key === "Escape") { event.preventDefault(); if (!disabled) onChange(""); }
        else if (event.key === "Enter" && value.length === 4 && !disabled) { event.preventDefault(); onComplete(value); }
      }}
      ref={ref}
      role="group"
      tabIndex={0}
    >
      <div className="pin-dots" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => <span className={index < value.length ? "pin-dot pin-dot--filled" : "pin-dot"} key={index} />)}
      </div>
      <div className="pin-keys">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => <button disabled={disabled} key={digit} onClick={() => append(digit)} type="button">{digit}</button>)}
        <button disabled={disabled} onClick={() => append("0")} type="button">0</button>
        <button aria-label="한 자리 지우기" disabled={disabled} onClick={remove} type="button">← 지우기</button>
      </div>
    </div>
  );
}
