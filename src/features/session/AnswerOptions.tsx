import type { AnswerOption } from "./buildQueue";

type Props = {
  options: AnswerOption[];
  answerIndex: number;
  selectedIndex: number | null;
  onPick: (index: number) => void;
};

export function AnswerOptions({ options, answerIndex, selectedIndex, onPick }: Props) {
  const answered = selectedIndex !== null;
  return (
    <div className="answer-options" aria-label="답 선택">
      {options.map((option, index) => {
        const correct = answered && index === answerIndex;
        const wrong = answered && index === selectedIndex && !correct;
        return (
          <button
            className={`answer-option${correct ? " answer-option--correct" : ""}${wrong ? " answer-option--wrong" : ""}`}
            disabled={answered}
            key={`${option.label}-${index}`}
            onClick={() => onPick(index)}
            type="button"
          >
            <span className="answer-option__key">{index + 1}</span>
            <span className="answer-option__copy">
              <strong>{option.label}</strong>
              <small>{option.sublabel}</small>
            </span>
            <span className="answer-option__mark" aria-hidden="true">{correct ? "✓" : wrong ? "✕" : ""}</span>
          </button>
        );
      })}
    </div>
  );
}
