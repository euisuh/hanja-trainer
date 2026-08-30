import type { CharacterEntry, ExampleSentence, Track, TrackEntry, WordEntry } from "../../shared/types";
import type { OnyomiScript } from "../../shared/settings";
import { SourceAttribution } from "../source/SourceAttribution";
import { trackThemes } from "../tracks/trackTheme";
import { CompareCard } from "./CompareCard";

const trackLabels = {
  kr: { prompt: "훈음을 고르세요" },
  jp: { prompt: "音読みを選べ" },
  cn: { prompt: "选择正确的拼音" },
} as const;

function levelLabel(entry: TrackEntry): string {
  if (entry.track === "kr") return `한자 ${entry.level}`;
  if (entry.track === "jp") return `漢検 ${entry.kanken} · ${entry.jlpt}`;
  return `${entry.hsk} · ${entry.tier}`;
}

function SentencePanel({ sentence, revealed }: { sentence: ExampleSentence; revealed: boolean }) {
  const points = Array.from(sentence.text);
  const theme = trackThemes[sentence.track];
  return (
    <div className="quiz-card__sentence" lang={theme.lang}>
      <div lang={trackThemes.kr.lang}>예문 · <SourceAttribution source={sentence.source} /></div>
      <p>
        {points.slice(0, sentence.targetIndex).join("")}
        <mark>{points[sentence.targetIndex]}</mark>
        {points.slice(sentence.targetIndex + 1).join("")}
      </p>
      {sentence.translationKo !== sentence.text && (
        <small className={revealed ? "quiz-card__translation--revealed" : ""} lang={trackThemes.kr.lang}>
          {revealed ? sentence.translationKo : "정답 후 번역이 공개됩니다"}
        </small>
      )}
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
  word?: WordEntry;
};

export function QuizCard({ character, track, compare, answered, correct, promptOverride, onyomiScript, word }: Props) {
  const entry = character.tracks.find((candidate) => candidate.track === track);
  if (!entry) return null;
  const theme = trackThemes[track];
  const sentence = word ? undefined : character.sentences.find((candidate) => candidate.track === track);
  const prompt = promptOverride ?? (compare ? "Enter로 계속" : word ? "한자어 독음을 고르세요" : trackLabels[track].prompt);
  return (
    <article className={`quiz-card quiz-card--${track}${answered ? correct ? " quiz-card--correct" : " quiz-card--wrong" : ""}`}>
      <div className="quiz-card__badges">
        <span lang={compare ? undefined : theme.lang}>{compare ? "교차 강화 · 한 글자 세 소리" : theme.badge}</span>
        <span lang={theme.lang}>{word ? `한자어 ${word.level}` : levelLabel(entry)}</span>
        <strong lang={promptOverride || compare ? undefined : theme.lang}>{prompt}</strong>
      </div>
      <div className="quiz-card__body">
        <div className={`quiz-card__glyph${answered && correct ? " quiz-card__glyph--correct" : ""}`} lang={theme.lang}>{word?.glyph ?? entry.glyph}</div>
        {sentence && <SentencePanel revealed={answered || compare} sentence={sentence} />}
        {word && <div className="quiz-card__sentence" lang="ko"><div>한자어 · <a href={word.sourceUrl}>한국어 위키낱말사전</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a></div></div>}
      </div>
      {compare && <CompareCard character={character} onyomiScript={onyomiScript} />}
    </article>
  );
}
