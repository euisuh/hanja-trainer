import type { CharacterEntry, ExampleSentence, Track, TrackEntry, WordEntry } from "../../shared/types";
import type { OnyomiScript } from "../../shared/settings";
import { SourceAttribution } from "../source/SourceAttribution";
import { trackThemes } from "../tracks/trackTheme";
import { CompareCard } from "./CompareCard";
import type { SessionQueueItem } from "./buildQueue";

const trackLabels = {
  kr: { prompt: "훈음을 고르세요", meaningPrompt: "뜻을 고르세요" },
  jp: { prompt: "音読みを選べ", meaningPrompt: "意味を選べ" },
  cn: { prompt: "选择正确的拼音", meaningPrompt: "选择正确的意思" },
} as const;

function promptFor(kind: SessionQueueItem["kind"], track: Track): string {
  if (kind === "compare") return "Enter로 계속";
  if (kind === "word") return "한자어 독음을 고르세요";
  if (kind === "meaning") return trackLabels[track].meaningPrompt;
  if (kind === "kun") return "訓読みを選べ";
  return trackLabels[track].prompt;
}

function levelLabel(entry: TrackEntry): string {
  if (entry.track === "kr") return `한자 ${entry.level}`;
  if (entry.track === "jp") return entry.kanken === "未指定" ? entry.jlpt : `${entry.jlpt} · 漢検 ${entry.kanken}`;
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
  kind: SessionQueueItem["kind"];
  promptOverride?: string;
  onyomiScript: OnyomiScript;
  word?: WordEntry;
};

export function QuizCard({ character, track, compare, answered, correct, kind, promptOverride, onyomiScript, word }: Props) {
  const entry = character.tracks.find((candidate) => candidate.track === track);
  if (!entry) return null;
  const theme = trackThemes[track];
  const sentence = word ? undefined : character.sentences.find((candidate) => candidate.track === track);
  const prompt = promptOverride ?? promptFor(kind, track);
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
