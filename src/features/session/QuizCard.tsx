import { forwardRef } from "react";
import type { CharacterEntry, ExampleSentence, Track, TrackEntry, WordEntry } from "../../../shared/types";
import type { OnyomiScript } from "../../../shared/settings";
import { HighlightedSentence } from "../source/HighlightedSentence";
import { SourceAttribution } from "../source/SourceAttribution";
import { trackThemes } from "../tracks/trackTheme";
import { CompareCard } from "./CompareCard";
import type { SessionQueueItem } from "../../../shared/buildQueue";

const trackLabels = {
  kr: { prompt: "훈음을 고르세요", meaningPrompt: "뜻을 고르세요" },
  jp: { prompt: "音読みを選べ", meaningPrompt: "意味を選べ" },
  cn: { prompt: "选择正确的拼音", meaningPrompt: "选择正确的意思" },
} as const;

export const wordLabels = {
  kr: { badge: "한국 · 한자어", name: "한자어", prompt: "한자어 독음을 고르세요" },
  jp: { badge: "日本 · 熟語", name: "熟語", prompt: "熟語の読みを選べ" },
  cn: { badge: "中国 · 词语", name: "词语", prompt: "选择正确的词语读音" },
} as const;

function promptFor(kind: SessionQueueItem["kind"], track: Track): string {
  if (kind === "compare") return "Enter로 계속";
  if (kind === "word") return wordLabels[track].prompt;
  if (kind === "meaning") return trackLabels[track].meaningPrompt;
  if (kind === "kun") return "訓読みを選べ";
  return trackLabels[track].prompt;
}

function levelLabel(entry: TrackEntry): string {
  if (entry.track === "kr") return `한자 ${entry.level}`;
  if (entry.track === "jp") return entry.kanken === "未指定" ? entry.jlpt : `${entry.jlpt} · 漢検 ${entry.kanken}`;
  return `${entry.hsk} · ${entry.tier}`;
}

function SentencePanel({ glyph, sentence, revealed }: { glyph: string; sentence: ExampleSentence; revealed: boolean }) {
  const theme = trackThemes[sentence.track];
  return (
    <div className="quiz-card__sentence" lang={theme.lang}>
      <div lang={trackThemes.kr.lang}>예문 · <SourceAttribution source={sentence.source} /></div>
      <p><HighlightedSentence glyph={glyph} targetIndex={sentence.targetIndex} text={sentence.text} /></p>
      {revealed && sentence.reading && <small lang={theme.lang}>{sentence.reading}</small>}
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
  kind: SessionQueueItem["kind"];
  promptOverride?: string;
  onyomiScript: OnyomiScript;
  word?: WordEntry;
  answerRevealed?: boolean;
};

export const QuizCard = forwardRef<HTMLElement, Props>(function QuizCard({ character, track, compare, answered, correct, kind, promptOverride, onyomiScript, word, answerRevealed }, ref) {
  const entry = character.tracks.find((candidate) => candidate.track === track);
  if (!entry) return null;
  const theme = trackThemes[track];
  const sentence = word ? undefined : character.sentences.find((candidate) => candidate.track === track);
  const prompt = promptOverride ?? promptFor(kind, track);
  return (
    <article aria-label={`${prompt} · ${word?.glyph ?? entry.glyph}`} className={`quiz-card quiz-card--${track}${answered ? correct ? " quiz-card--correct" : " quiz-card--wrong" : ""}`} ref={ref} tabIndex={-1}>
      <div className="quiz-card__badges">
        <span lang={compare ? undefined : theme.lang}>{compare ? "교차 강화 · 한 글자 세 소리" : word ? wordLabels[track].badge : theme.badge}</span>
        <span lang={theme.lang}>{word ? `${wordLabels[track].name} ${word.level}` : levelLabel(entry)}</span>
        <strong lang={promptOverride || compare ? undefined : theme.lang}>{prompt}</strong>
      </div>
      <div className="quiz-card__body">
        <div className={`quiz-card__glyph${answered && correct ? " quiz-card__glyph--correct" : ""}`} lang={theme.lang}>{word?.glyph ?? entry.glyph}</div>
        {sentence && answerRevealed !== false && <SentencePanel glyph={entry.glyph} revealed={answerRevealed === true || answered || compare} sentence={sentence} />}
        {word && answerRevealed !== false && <div className="quiz-card__sentence" lang={theme.lang}><div>{wordLabels[track].name} · <SourceAttribution sourceUrl={word.sourceUrl} /></div></div>}
      </div>
      {compare && <CompareCard character={character} onyomiScript={onyomiScript} />}
    </article>
  );
});
