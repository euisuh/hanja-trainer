import type { Track } from "../../shared/types";
import { trackThemes } from "../tracks/trackTheme";
import type { AnswerOption } from "./buildQueue";

type Props = {
  options: AnswerOption[];
  answerIndex: number;
  spent: boolean;
  selectedIndex: number | null;
  track: Track;
  onPick: (index: number) => void;
};

export function AnswerOptions({ options, answerIndex, spent, selectedIndex, track, onPick }: Props) {
  return (
    <div className={`answer-options${options.length === 4 ? "" : " answer-options--flexible"}`} aria-label="답 선택">
      {options.map((option, index) => {
        const correct = spent && index === answerIndex;
        const wrong = spent && index === selectedIndex && !correct;
        return (
          <button
            aria-disabled={spent}
            className={`answer-option${correct ? " answer-option--correct" : ""}${wrong ? " answer-option--wrong" : ""}`}
            key={`${option.label}-${index}`}
            onClick={() => { if (!spent) onPick(index); }}
            type="button"
          >
            <span className="answer-option__key">{index + 1}</span>
            <span className="answer-option__copy">
              <strong lang={trackThemes[track].lang}>{option.label}</strong>
            </span>
            <span className="answer-option__mark" aria-hidden="true">{correct ? "✓" : wrong ? "✕" : ""}</span>
          </button>
        );
      })}
    </div>
  );
}
