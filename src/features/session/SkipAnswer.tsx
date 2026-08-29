export function SkipAnswer({ disabled, onSkip }: { disabled: boolean; onSkip: () => void }) {
  return <button aria-disabled={disabled} className="skip-answer" onClick={() => { if (!disabled) onSkip(); }} type="button"><kbd>0</kbd><strong>모름</strong></button>;
}
