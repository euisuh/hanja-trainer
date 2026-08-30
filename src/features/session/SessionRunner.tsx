import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { tracks } from "../../design/tokens";
import { createPlacementState, isPlacementComplete, nextPlacementItem, placementResults, recordPlacementAnswer, type PlacementResult } from "../placement/adaptive";
import { gradeFromReview, initialState, schedule, type ReviewState } from "../../shared/fsrs";
import { toHiragana } from "../../shared/kana";
import type { OnyomiScript } from "../../shared/settings";
import type { CharacterEntry, Track } from "../../shared/types";
import type { PlacementAnswer, ProfileResponse, UnitTestAnswer, UnitTestResult } from "../../shared/api";
import { unitTestRetryOffset } from "../../shared/unitTestRetry";
import { AnswerOptions } from "./AnswerOptions";
import { buildQueue, buildReadingItem, reviewKey, type SessionQueueItem } from "./buildQueue";
import { ComboBadge } from "./ComboBadge";
import { FeedbackBar } from "./FeedbackBar";
import { ParticleBurst } from "./ParticleBurst";
import { PauseModal } from "./PauseModal";
import { QuizCard } from "./QuizCard";
import { SkipAnswer } from "./SkipAnswer";
import { useSessionKeys } from "./useSessionKeys";
import { useAnswerSubmit } from "./useAnswerSubmit";
import "./session.css";

export type SessionMode = "lesson" | "review" | "placement" | "unit-test";

const AUTO_ADVANCE_DELAY_MS = 250;
type Burst = { id: number; tier: 1 | 2 | 3; track: Track };

export type SessionResult = {
  xp: number;
  accuracy: number;
  bestCombo: number;
  nextReview: string;
  answered: number;
  correct: number;
  skipped: number;
  profile?: ProfileResponse;
  placement?: PlacementResult[];
  answers?: PlacementAnswer[];
  unitTestAnswers?: UnitTestAnswer[];
  unitTest?: UnitTestResult;
};

type Props = {
  mode: SessionMode;
  characters: CharacterEntry[];
  enabledTracks: Track[];
  length?: number;
  initialReviewStates?: ReadonlyMap<string, ReviewState>;
  onComplete: (result: SessionResult) => void;
  onQuit: () => void;
  queueOverride?: SessionQueueItem[];
  sessionId: string;
  onyomiScript: OnyomiScript;
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
  onComplete,
  onQuit,
  queueOverride,
  sessionId,
  onyomiScript,
}: Props) {
  const [states] = useState(() => new Map(initialReviewStates));
  const externalQueue = queueOverride !== undefined;
  const queue = useMemo(() => queueOverride ?? (mode === "placement" || mode === "unit-test" ? [] : buildQueue({ characters, enabledTracks, length, mode, reviewStates: states })), [characters, enabledTracks, length, mode, queueOverride, states]);
  const [adaptiveState, setAdaptiveState] = useState(() => createPlacementState(characters, enabledTracks, length));
  const [placementItem, setPlacementItem] = useState(() => {
    if (mode !== "placement" || externalQueue) return undefined;
    const state = createPlacementState(characters, enabledTracks, length);
    const item = nextPlacementItem(state, characters);
    return item ? buildReadingItem(item.character, item.track, characters, item.character.id) : undefined;
  });
  const [index, setIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [paused, setPaused] = useState(false);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [xp, setXp] = useState(0);
  const [lastXp, setLastXp] = useState(0);
  const [nextInterval, setNextInterval] = useState("—");
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [assessmentAnswers, setAssessmentAnswers] = useState<PlacementAnswer[]>([]);
  const [unitTestAnswers, setUnitTestAnswers] = useState<UnitTestAnswer[]>([]);
  const [unitTestQueue, setUnitTestQueue] = useState(() => mode === "unit-test" ? queue.map((entry, cardIndex) => ({ entry, cardIndex })) : []);
  const [unitTestMistakes, setUnitTestMistakes] = useState(0);
  const [clearedUnitTestCards, setClearedUnitTestCards] = useState<Set<number>>(() => new Set());
  const [sessionAnnouncement, setSessionAnnouncement] = useState({ sequence: 0, text: "" });
  const startedAt = useRef(0);
  const answerLocked = useRef(false);
  const advancing = useRef(false);
  const completing = useRef(false);
  const currentIndex = useRef(0);
  const nextBurstId = useRef(0);
  const advanceRef = useRef<() => void>(() => undefined);
  const { failed: syncFailed, submit, pendingCount, retry } = useAnswerSubmit(sessionId);
  const issuedUnitTestCard = mode === "unit-test" ? unitTestQueue[index] : undefined;
  const item = mode === "placement" && !externalQueue ? placementItem : issuedUnitTestCard?.entry ?? queue[index];
  const requiredUnitTestCards = queue.filter((entry) => entry.kind === "reading").length;
  const queueLength = mode === "placement" && !externalQueue ? length : mode === "unit-test" ? requiredUnitTestCards : queue.filter((entry) => entry.kind === "reading").length;
  const completedBefore = mode === "placement" && !externalQueue ? index : queue.slice(0, index).filter((entry) => entry.kind === "reading").length;
  const compare = item?.kind === "compare";
  const progress = mode === "unit-test" ? clearedUnitTestCards.size : completedBefore + Number(item?.kind === "reading");
  const answered = selectedIndex !== null || skipped;
  const correct = item?.kind === "reading" && selectedIndex === item.answerIndex;
  const autoAdvance = mode === "placement" || mode === "unit-test" || correct;

  useEffect(() => {
    advancing.current = false;
    startedAt.current = performance.now();
  }, [index]);

  function pick(choice: number | null) {
    if (!item || item.kind !== "reading" || selectedIndex !== null || answerLocked.current) return;
    answerLocked.current = true;
    const isSkipped = choice === null;
    const isCorrect = choice === item.answerIndex;
    const elapsedMs = Math.max(0, Math.round(performance.now() - startedAt.current));
    let interval = "—";
    if (mode === "placement" || mode === "unit-test") {
      const entry = item.character.tracks.find((candidate) => candidate.track === item.track);
      if (!entry) {
        answerLocked.current = false;
        return;
      }
      if (mode === "placement") {
        setAdaptiveState(recordPlacementAnswer(adaptiveState, { character: item.character, track: item.track, levelOrd: entry.levelOrd }, isCorrect));
        setAssessmentAnswers((current) => [...current, { characterKey: item.character.key, track: item.track, correct: isCorrect, skipped: isSkipped, levelOrd: entry.levelOrd }]);
        setSessionAnnouncement((current) => ({ sequence: current.sequence + 1, text: "응답을 기록했습니다. 다음 문항으로 이동합니다." }));
      } else {
        const cardIndex = issuedUnitTestCard?.cardIndex ?? index;
        const mistakes = unitTestMistakes + Number(!isCorrect);
        const answer = item.options[item.answerIndex]?.label ?? "";
        const displayedAnswer = item.track === "jp" && onyomiScript === "hiragana" ? toHiragana(answer) : answer;
        setUnitTestAnswers((current) => [...current, { cardIndex, characterKey: item.character.key, selectedIndex: choice }]);
        setSessionAnnouncement((current) => ({
          sequence: current.sequence + 1,
          text: isCorrect
            ? "정답입니다. 다음 문항으로 이동합니다."
            : `${isSkipped ? "모름을 선택했습니다." : "오답입니다."} 정답은 ${displayedAnswer}입니다. 남은 하트 ${Math.max(0, 3 - mistakes)}개. ${mistakes >= 3 ? "유닛 테스트를 종료합니다." : "이 문항은 뒤에서 다시 나옵니다."}`,
        }));
        if (isCorrect) {
          setClearedUnitTestCards((current) => new Set(current).add(cardIndex));
        } else {
          setUnitTestMistakes(mistakes);
          if (mistakes < 3) {
            setUnitTestQueue((current) => {
              const retry = current[index];
              if (!retry) return current;
              const insertAt = index + 1 + unitTestRetryOffset({
                sessionId,
                originalCardIndex: cardIndex,
                mistakeNumber: mistakes,
                currentQueuePosition: index,
                remainingLength: current.length - index - 1,
              });
              return [...current.slice(0, insertAt), retry, ...current.slice(insertAt)];
            });
          }
        }
      }
    } else {
      const key = reviewKey(item.character.id, item.track);
      const previous = states.get(key) ?? initialState(new Date());
      const result = schedule(previous, gradeFromReview(isCorrect, isSkipped, elapsedMs), new Date());
      states.set(key, result.next);
      interval = intervalLabel(result.next.scheduledDays);
      if (isCorrect) setSessionAnnouncement((current) => ({ sequence: current.sequence + 1, text: "정답입니다. 다음 문항으로 이동합니다." }));
    }
    const answeredIndex = index;
    if (mode !== "unit-test") submit({ cardIndex: index, characterKey: item.character.key, track: item.track, correct: isCorrect, skipped: isSkipped, elapsedMs, mode }, (response) => {
      if (currentIndex.current === answeredIndex && mode !== "placement") setNextInterval(response.dueLabel);
    });
    const gained = isCorrect ? 10 + Math.min(10, combo * 2) : 0;
    const nextCombo = isCorrect ? combo + 1 : 0;
    setSelectedIndex(choice);
    setSkipped(isSkipped);
    setLastXp(gained);
    setXp((value) => value + gained);
    setCombo(nextCombo);
    setBestCombo((value) => Math.max(value, nextCombo));
    setCorrectCount((value) => value + Number(isCorrect));
    setAnsweredCount((value) => value + 1);
    setSkippedCount((value) => value + Number(isSkipped));
    setNextInterval(interval);
    if (isCorrect) {
      const tier = nextCombo >= 6 ? 3 : nextCombo >= 3 ? 2 : 1;
      setBursts((current) => [...current.slice(-2), { id: nextBurstId.current += 1, tier, track: item.track }]);
    }
  }

  function advance() {
    if (advancing.current || !item || (item.kind === "reading" && !answered)) return;
    advancing.current = true;
    if (mode === "placement" && !externalQueue) {
      const next = nextPlacementItem(adaptiveState, characters);
      if (isPlacementComplete(adaptiveState) || !next) {
        if (completing.current) return;
        completing.current = true;
        onComplete({
          xp,
          accuracy: answeredCount === 0 ? 0 : Math.round(correctCount / answeredCount * 100),
          bestCombo,
          nextReview: "—",
          answered: answeredCount,
          correct: correctCount,
          skipped: skippedCount,
          placement: placementResults(adaptiveState),
          answers: assessmentAnswers,
        });
        return;
      }
      setPlacementItem(buildReadingItem(next.character, next.track, characters, index + next.character.id + 1));
    } else if (mode === "unit-test" ? unitTestMistakes >= 3 || index + 1 >= unitTestQueue.length : index + 1 >= queue.length) {
      if (completing.current) return;
      completing.current = true;
      onComplete({
        xp,
        accuracy: answeredCount === 0 ? 0 : Math.round(correctCount / answeredCount * 100),
        bestCombo,
        nextReview: nextInterval,
        answered: answeredCount,
        correct: correctCount,
        skipped: skippedCount,
        placement: mode === "placement" ? placementResults(adaptiveState) : undefined,
        answers: mode === "placement" ? assessmentAnswers : undefined,
        unitTestAnswers: mode === "unit-test" ? unitTestAnswers : undefined,
      });
      return;
    }
    setIndex((value) => value + 1);
    currentIndex.current += 1;
    answerLocked.current = false;
    setSelectedIndex(null);
    setSkipped(false);
    setLastXp(0);
    startedAt.current = performance.now();
  }

  useEffect(() => {
    advanceRef.current = advance;
  });

  useEffect(() => {
    if (!answered || !autoAdvance || paused) return;
    const timer = window.setTimeout(() => advanceRef.current(), AUTO_ADVANCE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [answered, autoAdvance, index, paused]);

  useSessionKeys({
    active: Boolean(item) && !paused,
    answered,
    compare,
    onPick: pick,
    onSkip: () => pick(null),
    onAdvance: advance,
    onPause: () => setPaused(true),
  });

  if (!item) {
    if (mode === "lesson") return <div className="session-empty"><h1>활성화된 트랙에 학습할 콘텐츠가 부족합니다.</h1><p>설정에서 다른 트랙을 활성화하거나 복습 큐를 확인해 주세요.</p><Link to="/settings">설정으로 가기</Link><Link to="/review">복습 큐로 가기</Link><button onClick={onQuit} type="button">지도로 돌아가기</button></div>;
    if (mode === "placement") return <div className="session-empty"><h1>배치에 필요한 콘텐츠가 부족합니다.</h1><p>트랙 선택을 바꾼 뒤 다시 시작해 주세요.</p><button onClick={onQuit} type="button">트랙 선택으로 돌아가기</button></div>;
    if (mode === "unit-test") return <div className="session-empty"><h1>유닛 테스트를 만들 수 없습니다.</h1><p>이 유닛의 문항 구성을 확인해 주세요.</p><button onClick={onQuit} type="button">지도로 돌아가기</button></div>;
    return <div className="session-empty"><h1>복습할 카드가 없습니다.</h1><button onClick={onQuit} type="button">복습 큐로 돌아가기</button></div>;
  }
  const source = item.character.sentences.find((sentence) => sentence.track === item.track)?.source;
  const feedbackNote = compare
    ? "이미 아는 글자를 다른 트랙과 함께 확인합니다."
    : mode === "unit-test"
      ? answered
        ? correct ? "좋아요. 바로 다음 문항으로 넘어갑니다." : unitTestMistakes >= 3 ? "하트를 모두 사용했습니다." : "틀린 문항은 뒤에서 다시 나옵니다."
        : "같은 글자도 다른 보기로 다시 출제됩니다."
    : mode === "placement"
      ? answered ? "응답에 맞춰 시작 급수를 조정했습니다." : "정답에 따라 다음 문항 난이도가 바뀝니다."
    : !answered
      ? source ? `${source}에서 발췌` : "이 글자는 출처가 확인된 예문이 없습니다."
      : correct
        ? `다음 복습: ${nextInterval}`
        : `${item.character.tracks.find((entry) => entry.track === item.track)?.glyph} = ${item.character.meaningKo}`;
  const style = {
    "--session-accent": tracks[item.track].accent,
    "--session-accent-text": tracks[item.track].accentText,
    "--session-soft": tracks[item.track].soft,
    "--session-font": tracks[item.track].font,
  } as CSSProperties;
  const displayOptions = item.kind === "reading" && item.track === "jp" && onyomiScript === "hiragana"
    ? item.options.map((option) => ({ ...option, label: toHiragana(option.label) }))
    : item.kind === "reading" ? item.options : [];

  return (
    <section className={`session-runner${mode === "unit-test" ? " session-runner--unit-test" : ""}`} style={style}>
      <div className="session-chrome">
        <button aria-label="세션 일시정지" onClick={() => setPaused(true)} type="button">esc</button>
        <div aria-label={`진행률 ${progress}/${queueLength}`} className="session-progress" role="progressbar" aria-valuemax={queueLength} aria-valuemin={0} aria-valuenow={progress}>
          <span style={{ width: `${progress / queueLength * 100}%` }} />
        </div>
        <strong>{progress}/{queueLength}</strong>
        {mode === "unit-test" ? (
          <div aria-label={`남은 하트 ${Math.max(0, 3 - unitTestMistakes)}개`} className="unit-test-hearts" role="img">
            {[0, 1, 2].map((heart) => <span aria-hidden="true" className={heart < 3 - unitTestMistakes ? "" : "unit-test-heart--lost"} key={heart}>{heart < 3 - unitTestMistakes ? "♥" : "♡"}</span>)}
          </div>
        ) : <ComboBadge combo={combo} />}
        {pendingCount > 0 && (syncFailed
          ? <button className="session-sync" onClick={() => void retry()} type="button">저장 재시도 · {pendingCount}</button>
          : <span className="session-sync" role="status">동기화 중 · {pendingCount}</span>)}
      </div>
      <div aria-atomic="true" aria-live="polite" className="session-announcement">
        {sessionAnnouncement.text} {sessionAnnouncement.sequence > 0 ? `응답 알림 ${sessionAnnouncement.sequence}` : ""}
      </div>
      <div aria-hidden="true" className="celebration-layer">
        {bursts.map((burst) => (
          <ParticleBurst key={burst.id} onDone={() => setBursts((current) => current.filter(({ id }) => id !== burst.id))} tier={burst.tier} track={burst.track} />
        ))}
      </div>
      <div className="session-card-wrap" key={index}>
        <QuizCard answered={answered} character={item.character} compare={compare} correct={correct} onyomiScript={onyomiScript} promptOverride={mode === "placement" ? `배치 문항 ${progress}/${queueLength}` : mode === "unit-test" ? `유닛 테스트 ${progress}/${queueLength}` : undefined} track={item.track} />
        {item.kind === "reading" && (
          <>
            <AnswerOptions answerIndex={item.answerIndex} onPick={(choice) => void pick(choice)} options={displayOptions} selectedIndex={selectedIndex} spent={answered} track={item.track} />
            <SkipAnswer disabled={answered} onSkip={() => pick(null)} />
          </>
        )}
        <FeedbackBar
          answered={answered}
          compare={compare}
          correct={correct}
          skipped={skipped}
          correctAnswer={item.kind === "reading" ? displayOptions[item.answerIndex]?.label : undefined}
          correctIndex={item.kind === "reading" ? item.answerIndex : 0}
          last={mode === "placement" && !externalQueue ? index + 1 === length : index + 1 === queue.length}
          note={feedbackNote}
          onNext={advance}
          xp={lastXp}
          autoAdvance={autoAdvance}
        />
      </div>
      {paused && <PauseModal onQuit={onQuit} onResume={() => setPaused(false)} />}
    </section>
  );
}
