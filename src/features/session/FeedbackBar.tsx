type Props = {
  answered: boolean;
  compare: boolean;
  correct: boolean;
  skipped: boolean;
  correctIndex: number;
  correctAnswer?: string;
  xp: number;
  note: string;
  last: boolean;
  error?: string;
  onNext: () => void;
  autoAdvance?: boolean;
};

export function FeedbackBar({ answered, compare, correct, skipped, correctIndex, correctAnswer, xp, note, last, error, onNext, autoAdvance = false }: Props) {
  const state = error ? "wrong" : compare ? "compare" : !answered ? "idle" : skipped ? "skipped" : correct ? "correct" : "wrong";
  const text = error
    ? "저장하지 못했습니다"
    : compare
      ? "한 글자, 세 소리."
      : !answered
        ? "숫자키 1–4로 답하세요"
        : skipped
          ? `모름 · 정답 ${correctAnswer ?? `${correctIndex + 1}번`}`
          : correct
          ? "정확해요"
          : `오답 · 정답 ${correctAnswer ?? `${correctIndex + 1}번`}`;
  const body = correct && !error && !compare && !skipped
    ? <>정확해요 <span className="feedback-bar__xp" key={xp}>+{xp} XP</span></>
    : text;
  const canAdvance = compare || answered;
  return (
    <div className={`feedback-bar feedback-bar--${state}`} aria-live={autoAdvance ? "off" : "polite"}>
      <strong>{body}</strong>
      <span>{error ?? note}</span>
      {!autoAdvance && (
        <button disabled={!canAdvance} onClick={onNext} type="button">
          {last ? "세션 마치기" : "다음 카드"} <kbd>ENTER</kbd>
        </button>
      )}
    </div>
  );
}
