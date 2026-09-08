import { correctHeadline, wrongHeadline } from "./feedbackCopy";

type Props = {
  answered: boolean;
  compare: boolean;
  correct: boolean;
  skipped: boolean;
  correctIndex: number;
  correctAnswer?: string;
  xp?: number;
  cardIndex: number;
  combo: number;
  lostCombo: number;
  note: string;
  last: boolean;
  error?: string;
  onNext: () => void;
  autoAdvance?: boolean;
  idleText?: string;
  answeredText?: string;
};

export function FeedbackBar({ answered, compare, correct, skipped, correctIndex, correctAnswer, xp, cardIndex, combo, lostCombo, note, last, error, onNext, autoAdvance = false, idleText = "1–4 중에 골라보세요", answeredText }: Props) {
  const state = error ? "wrong" : compare ? "compare" : !answered ? "idle" : skipped ? "skipped" : correct ? "correct" : "wrong";
  const text = error
    ? "저장하지 못했습니다"
    : compare
      ? "한 글자, 세 소리."
      : !answered
        ? idleText
        : answeredText ?? (
          skipped
            ? `모름 · 정답 ${correctAnswer ?? `${correctIndex + 1}번`}`
            : correct
              ? correctHeadline(cardIndex, combo)
              : `${wrongHeadline(cardIndex)} · 정답 ${correctAnswer ?? `${correctIndex + 1}번`}`
        );
  const body = correct && !error && !compare && !skipped && xp !== undefined
    ? <>{text} <span className="feedback-bar__xp" key={xp}>+{xp} XP</span></>
    : text;
  const canAdvance = compare || answered;
  return (
    <div className={`feedback-bar feedback-bar--${state}`} aria-live={autoAdvance ? "off" : "polite"}>
      <strong>{body}</strong>
      {!error && answered && !correct && lostCombo >= 3 && <em className="feedback-bar__lost">{lostCombo}× 콤보가 끊겼어요</em>}
      <span>{error ?? note}</span>
      {!autoAdvance && (
        <button disabled={!canAdvance} onClick={onNext} type="button">
          {last ? "세션 마치기" : "다음 카드"} <kbd>ENTER</kbd>
        </button>
      )}
    </div>
  );
}
