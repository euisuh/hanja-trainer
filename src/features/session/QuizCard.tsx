import type { CharacterEntry, ExampleSentence, Track, TrackEntry } from "../../shared/types";
import type { OnyomiScript } from "../../shared/settings";
import { CompareCard } from "./CompareCard";

const trackLabels = {
  kr: { badge: "한국 · 한자", prompt: "훈음을 고르세요" },
  jp: { badge: "日本 · 漢字", prompt: "音読みを選べ" },
  cn: { badge: "中国 · 汉字", prompt: "选择正确的拼音" },
} as const;

function levelLabel(entry: TrackEntry): string {
  if (entry.track === "kr") return `한자 ${entry.level}`;
  if (entry.track === "jp") return `漢検 ${entry.kanken} · ${entry.jlpt}`;
  return `${entry.hsk} · ${entry.tier}`;
}

function SentencePanel({ sentence, revealed }: { sentence: ExampleSentence; revealed: boolean }) {
  const points = Array.from(sentence.text);
  return (
    <div className="quiz-card__sentence">
      <div>예문 · {sentence.source}</div>
      <p>
        {points.slice(0, sentence.targetIndex).join("")}
        <mark>{points[sentence.targetIndex]}</mark>
        {points.slice(sentence.targetIndex + 1).join("")}
      </p>
      <small className={revealed ? "quiz-card__translation--revealed" : ""}>
        {revealed ? sentence.translationKo : "정답 후 번역이 공개됩니다"}
      </small>
    </div>
  );
}

type Props = {
  character: CharacterEntry;
  track: Track;
  compare: boolean;
  answered: boolean;
  correct: boolean;
  promptOverride?: string;
  onyomiScript: OnyomiScript;
};

export function QuizCard({ character, track, compare, answered, correct, promptOverride, onyomiScript }: Props) {
  const entry = character.tracks.find((candidate) => candidate.track === track);
  if (!entry) return null;
  const sentence = character.sentences.find((candidate) => candidate.track === track);
  return (
    <article className={`quiz-card quiz-card--${track}${answered ? correct ? " quiz-card--correct" : " quiz-card--wrong" : ""}`}>
      <div className="quiz-card__badges">
        <span>{compare ? "교차 강화 · 한 글자 세 소리" : trackLabels[track].badge}</span>
        <span>{levelLabel(entry)}</span>
        <strong>{promptOverride ?? (compare ? "Enter로 계속" : trackLabels[track].prompt)}</strong>
      </div>
      <div className="quiz-card__body">
        <div className={`quiz-card__glyph${answered && correct ? " quiz-card__glyph--correct" : ""}`}>{entry.glyph}</div>
        {sentence && <SentencePanel revealed={answered || compare} sentence={sentence} />}
      </div>
      {compare && <CompareCard character={character} onyomiScript={onyomiScript} />}
    </article>
  );
}
