import type { Track } from "../../shared/types";
import { trackThemes } from "../tracks/trackTheme";
import type { AnswerOption } from "./buildQueue";

type Props = {
  options: AnswerOption[];
  answerIndex: number;
  selectedIndex: number | null;
  track: Track;
  onPick: (index: number) => void;
};

export function AnswerOptions({ options, answerIndex, selectedIndex, track, onPick }: Props) {
  const answered = selectedIndex !== null;
  return (
    <div className="answer-options" aria-label="답 선택">
      {options.map((option, index) => {
        const correct = answered && index === answerIndex;
        const wrong = answered && index === selectedIndex && !correct;
        return (
          <button
            aria-disabled={answered}
            className={`answer-option${correct ? " answer-option--correct" : ""}${wrong ? " answer-option--wrong" : ""}`}
            key={`${option.label}-${index}`}
            onClick={() => { if (!answered) onPick(index); }}
            type="button"
          >
            <span className="answer-option__key">{index + 1}</span>
            <span className="answer-option__copy">
              <strong lang={trackThemes[track].lang}>{option.label}</strong>
              <small lang={track === "cn" ? undefined : trackThemes[track].lang}>{option.sublabel}</small>
            </span>
            <span className="answer-option__mark" aria-hidden="true">{correct ? "✓" : wrong ? "✕" : ""}</span>
          </button>
        );
      })}
    </div>
  );
}
