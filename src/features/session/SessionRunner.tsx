import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { tracks } from "../../design/tokens";
import { createPlacementState, isPlacementComplete, nextPlacementItem, placementResults, recordPlacementAnswer, type PlacementResult } from "../placement/adaptive";
import { gradeFromAnswer, initialState, schedule, type ReviewLogEntry, type ReviewState } from "../../shared/fsrs";
import type { CharacterEntry, Track } from "../../shared/types";
import { AnswerOptions } from "./AnswerOptions";
import { buildQueue, buildReadingItem, reviewKey, type SessionQueueItem } from "./buildQueue";
import { ComboBadge } from "./ComboBadge";
import { FeedbackBar } from "./FeedbackBar";
import { ParticleBurst } from "./ParticleBurst";
import { PauseModal } from "./PauseModal";
import { QuizCard } from "./QuizCard";
import { useSessionKeys } from "./useSessionKeys";
import "./session.css";

export type SessionMode = "lesson" | "review" | "placement";

export type PersistedAnswer = {
  characterId: number;
  track: Track;
  mode: SessionMode;
  correct: boolean;
  elapsedMs: number;
  state: ReviewState;
  log: ReviewLogEntry;
};

export type SessionResult = {
  xp: number;
  accuracy: number;
  bestCombo: number;
  nextReview: string;
  placement?: PlacementResult[];
};

type Props = {
  mode: SessionMode;
  characters: CharacterEntry[];
  enabledTracks: Track[];
  length?: number;
  initialReviewStates?: ReadonlyMap<string, ReviewState>;
  onPersist?: (answer: PersistedAnswer) => void | Promise<void>;
  onComplete: (result: SessionResult) => void;
  onQuit: () => void;
  queueOverride?: SessionQueueItem[];
};

function intervalLabel(days: number): string {
  return days <= 0 ? "곧" : `${days}일 후`;
}

export function SessionRunner({
  mode,
  characters,
  enabledTracks,
  length = mode === "placement" ? 15 : 8,
  initialReviewStates = new Map(),
  onPersist,
  onComplete,
  onQuit,
  queueOverride,
}: Props) {
  const [states] = useState(() => new Map(initialReviewStates));
  const externalQueue = queueOverride !== undefined;
  const queue = useMemo(() => queueOverride ?? (mode === "placement" ? [] : buildQueue({ characters, enabledTracks, length, mode, reviewStates: states })), [characters, enabledTracks, length, mode, queueOverride, states]);
  const [adaptiveState, setAdaptiveState] = useState(() => createPlacementState(characters, enabledTracks, length));
  const [placementItem, setPlacementItem] = useState(() => {
    const state = createPlacementState(characters, enabledTracks, length);
    const item = nextPlacementItem(state, characters);
    return item ? buildReadingItem(item.character, item.track, characters, item.character.id) : undefined;
  });
  const [index, setIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [persistenceError, setPersistenceError] = useState("");
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [xp, setXp] = useState(0);
  const [lastXp, setLastXp] = useState(0);
  const [nextInterval, setNextInterval] = useState("—");
  const [burstKey, setBurstKey] = useState(0);
  const startedAt = useRef(0);
  const answerLocked = useRef(false);
  const item = mode === "placement" && !externalQueue ? placementItem : queue[index];
  const queueLength = externalQueue ? queue.length : mode === "placement" ? length : queue.length;
  const compare = item?.kind === "compare";
  const answered = selectedIndex !== null;
  const correct = item?.kind === "reading" && selectedIndex === item.answerIndex;

  useEffect(() => {
    startedAt.current = performance.now();
  }, [index]);

  async function pick(choice: number) {
    if (!item || item.kind !== "reading" || selectedIndex !== null || answerLocked.current) return;
    answerLocked.current = true;
    const isCorrect = choice === item.answerIndex;
    const elapsedMs = Math.max(0, Math.round(performance.now() - startedAt.current));
    setSaving(true);
    setPersistenceError("");
    try {
      let interval = "—";
      if (mode === "placement") {
        const entry = item.character.tracks.find((candidate) => candidate.track === item.track);
        if (!entry) throw new Error("배치 문항의 트랙 정보를 찾을 수 없습니다.");
        setAdaptiveState(recordPlacementAnswer(adaptiveState, { character: item.character, track: item.track, levelOrd: entry.levelOrd }, isCorrect));
      } else {
        const key = reviewKey(item.character.id, item.track);
        const previous = states.get(key) ?? initialState(new Date());
        const result = schedule(previous, gradeFromAnswer(isCorrect, elapsedMs), new Date());
        await onPersist?.({
          characterId: item.character.id,
          track: item.track,
          mode,
          correct: isCorrect,
          elapsedMs,
          state: result.next,
          log: result.log,
        });
        states.set(key, result.next);
        interval = intervalLabel(result.next.scheduledDays);
      }
      const gained = isCorrect ? 10 + Math.min(10, combo * 2) : 0;
      const nextCombo = isCorrect ? combo + 1 : 0;
      setSelectedIndex(choice);
      setLastXp(gained);
      setXp((value) => value + gained);
      setCombo(nextCombo);
      setBestCombo((value) => Math.max(value, nextCombo));
      setCorrectCount((value) => value + Number(isCorrect));
      setAnsweredCount((value) => value + 1);
      setNextInterval(interval);
      if (isCorrect) setBurstKey((value) => value + 1);
    } catch (error) {
      answerLocked.current = false;
      setPersistenceError(error instanceof Error ? error.message : "다시 시도하세요.");
    } finally {
      setSaving(false);
    }
  }

  function advance() {
    if (!item || (item.kind === "reading" && selectedIndex === null)) return;
    if (mode === "placement" && !externalQueue) {
      const next = nextPlacementItem(adaptiveState, characters);
      if (isPlacementComplete(adaptiveState) || !next) {
        onComplete({
          xp,
          accuracy: answeredCount === 0 ? 0 : Math.round(correctCount / answeredCount * 100),
          bestCombo,
          nextReview: "—",
          placement: placementResults(adaptiveState),
        });
        return;
      }
      setPlacementItem(buildReadingItem(next.character, next.track, characters, index + next.character.id + 1));
    } else if (index + 1 >= queue.length) {
      onComplete({
        xp,
        accuracy: answeredCount === 0 ? 0 : Math.round(correctCount / answeredCount * 100),
        bestCombo,
        nextReview: nextInterval,
        placement: mode === "placement" ? placementResults(adaptiveState) : undefined,
      });
      return;
    }
    setIndex((value) => value + 1);
    answerLocked.current = false;
    setSelectedIndex(null);
    setPersistenceError("");
    setLastXp(0);
    startedAt.current = performance.now();
  }

  useSessionKeys({
    active: Boolean(item) && !paused && !saving,
    answered,
    compare,
    onPick: (choice) => void pick(choice),
    onAdvance: advance,
    onPause: () => setPaused(true),
  });

  if (!item) {
    return <div className="session-empty"><h1>복습할 카드가 없습니다.</h1><button onClick={onQuit}>지도로 돌아가기</button></div>;
  }
  const source = item.character.sentences.find((sentence) => sentence.track === item.track)?.source;
  const feedbackNote = compare
    ? "이미 아는 글자를 다른 트랙과 함께 확인합니다."
    : mode === "placement"
      ? answered ? "응답에 맞춰 시작 급수를 조정했습니다." : "정답에 따라 다음 문항 난이도가 바뀝니다."
    : !answered
      ? source ? `${source}에서 발췌` : "이 글자는 출처가 확인된 예문이 없습니다."
      : correct
        ? `다음 복습: ${nextInterval}`
        : `${item.character.tracks.find((entry) => entry.track === item.track)?.glyph} = ${item.character.meaningKo}`;
  const style = {
    "--session-accent": tracks[item.track].accent,
    "--session-soft": tracks[item.track].soft,
    "--session-font": tracks[item.track].font,
  } as CSSProperties;

  return (
    <section className="session-runner" style={style}>
      <div className="session-chrome">
        <button aria-label="세션 일시정지" onClick={() => setPaused(true)} type="button">esc</button>
        <div aria-label={`진행률 ${index + 1}/${queueLength}`} className="session-progress" role="progressbar" aria-valuemax={queueLength} aria-valuemin={0} aria-valuenow={index + 1}>
          <span style={{ width: `${(index + 1) / queueLength * 100}%` }} />
        </div>
        <strong>{index + 1}/{queueLength}</strong>
        <ComboBadge combo={combo} />
      </div>
      <div className="session-card-wrap" key={index}>
        <QuizCard answered={answered} character={item.character} compare={compare} correct={correct} promptOverride={mode === "placement" ? `배치 문항 ${index + 1}/${queueLength}` : undefined} track={item.track} />
        {item.kind === "reading" && (
          <AnswerOptions answerIndex={item.answerIndex} onPick={(choice) => void pick(choice)} options={item.options} selectedIndex={selectedIndex} />
        )}
        <FeedbackBar
          answered={answered}
          compare={compare}
          correct={correct}
          correctIndex={item.kind === "reading" ? item.answerIndex : 0}
          error={persistenceError}
          last={index + 1 === queueLength}
          note={feedbackNote}
          onNext={advance}
          xp={lastXp}
        />
        {answered && correct && <ParticleBurst key={burstKey} track={item.track} />}
      </div>
      {paused && <PauseModal onQuit={onQuit} onResume={() => setPaused(false)} />}
    </section>
  );
}
