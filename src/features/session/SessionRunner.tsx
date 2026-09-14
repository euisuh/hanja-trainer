import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { tracks } from "../../design/tokens";
import { createPlacementState, isPlacementComplete, nextPlacementItem, placementResults, recordPlacementAnswer, type PlacementResult } from "../../../shared/adaptive";
import { gradeFromReview, initialState, schedule, type ReviewState } from "../../../shared/fsrs";
import { toHiragana } from "../../../shared/kana";
import { wordAttribution } from "../../../shared/sentenceAttribution";
import type { OnyomiScript, SoundMode } from "../../../shared/settings";
import type { CharacterEntry, Track } from "../../../shared/types";
import { trackThemes } from "../tracks/trackTheme";
import type { PlacementAnswer, ProfileResponse, UnitTestAnswer, UnitTestResult } from "../../../shared/api";
import { unitTestRetryOffset } from "../../../shared/unitTestRetry";
import { AnswerOptions } from "./AnswerOptions";
import { buildQueue, buildReadingItem, meaningFor, readingFor, reviewKey, type SessionQueueItem } from "../../../shared/buildQueue";
import { ComboBadge } from "./ComboBadge";
import { FeedbackBar } from "./FeedbackBar";
import { playCorrect, playSkip, playWrong } from "./feedbackSound";
import { buzz } from "../../platform/haptics";
import { onBackButton } from "../../platform/lifecycle";
import { ParticleBurst, type BurstAnchor } from "./ParticleBurst";
import { PauseModal } from "./PauseModal";
import { QuizCard, wordLabels } from "./QuizCard";
import { SkipAnswer } from "./SkipAnswer";
import { useSessionKeys } from "./useSessionKeys";
import { useAnswerSubmit } from "./useAnswerSubmit";
import { createActiveAnswerTimer } from "./activeAnswerTimer";
import { insertCorrection, issuedQueue } from "./correctionQueue";
import "./session.css";

export type SessionMode = "lesson" | "review" | "level-review" | "placement" | "unit-test";

const AUTO_ADVANCE_DELAY_MS = 900;
const AUTO_ADVANCE_DELAY_MS_FAST = 400;
type Burst = { anchor: BurstAnchor; id: number; tier: 1 | 2 | 3; track: Track };

export function autoAdvanceDelay(mode: SessionMode, correct: boolean, reducedMotion: boolean): number {
  return reducedMotion || mode === "placement" || mode === "unit-test" || !correct
    ? AUTO_ADVANCE_DELAY_MS_FAST
    : AUTO_ADVANCE_DELAY_MS;
}

export function correctAnswerXp(combo: number): number {
  return 10 + Math.min(40, combo * 3);
}

export function recallPromptFor(kind: SessionQueueItem["kind"], track: Track): string {
  if (kind === "word") return "이 단어의 읽기를 말하거나 써 보세요";
  if (kind === "meaning") return "이 글자의 뜻을 말하거나 써 보세요";
  if (kind === "kun") return "이 글자의 훈독을 말하거나 써 보세요";
  if (track === "jp") return "이 글자의 음독(音読み)을 말하거나 써 보세요";
  if (track === "cn") return "이 글자의 병음과 발음을 말하거나 써 보세요";
  return "이 글자의 훈음(뜻과 소리)을 말하거나 써 보세요";
}

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
  soundMode: SoundMode;
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
  soundMode,
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
  const [recallState, setRecallState] = useState<"concealed" | "revealed" | "choices">("concealed");
  const [paused, setPaused] = useState(() => document.visibilityState === "hidden");
  const [combo, setCombo] = useState(0);
  const [lostCombo, setLostCombo] = useState(0);
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
  const [normalQueue, setNormalQueue] = useState(() => issuedQueue(queue));
  const [unitTestMistakes, setUnitTestMistakes] = useState(0);
  const [clearedUnitTestCards, setClearedUnitTestCards] = useState<Set<number>>(() => new Set());
  const [sessionAnnouncement, setSessionAnnouncement] = useState({ sequence: 0, text: "" });
  const [answerTimer] = useState(createActiveAnswerTimer);
  const pausedRef = useRef(paused);
  const answerLocked = useRef(false);
  const advancing = useRef(false);
  const completing = useRef(false);
  const currentIndex = useRef(0);
  const nextBurstId = useRef(0);
  const runnerRef = useRef<HTMLElement>(null);
  const quizCardRef = useRef<HTMLElement>(null);
  const focusedCardIndex = useRef(-1);
  const recallResultRef = useRef<HTMLParagraphElement>(null);
  const advanceRef = useRef<() => void>(() => undefined);
  const { failed: syncFailed, submit, pendingCount, retry } = useAnswerSubmit(sessionId);
  const normalMode = mode === "lesson" || mode === "review" || mode === "level-review";
  const issuedNormalCard = normalMode ? normalQueue[index] : undefined;
  const issuedUnitTestCard = mode === "unit-test" ? unitTestQueue[index] : undefined;
  const item = mode === "placement" && !externalQueue ? placementItem : issuedUnitTestCard?.entry ?? issuedNormalCard?.entry ?? queue[index];
  const correction = issuedNormalCard?.correction === true;
  const remainingCorrections = normalQueue.slice(index).filter((candidate) => candidate.correction).length;
  const requiredUnitTestCards = queue.filter((entry) => entry.kind === "reading").length;
  const queueLength = mode === "placement" && !externalQueue ? length : mode === "unit-test" ? requiredUnitTestCards : queue.filter((entry) => entry.kind !== "compare").length;
  const completedBefore = mode === "placement" && !externalQueue ? index : normalMode ? normalQueue.slice(0, index).filter(({ correction, entry }) => !correction && entry.kind !== "compare").length : queue.slice(0, index).filter((entry) => entry.kind !== "compare").length;
  const compare = item?.kind === "compare";
  const progress = mode === "unit-test" ? clearedUnitTestCards.size : completedBefore + Number(!correction && item?.kind !== "compare");
  const answered = selectedIndex !== null || skipped;
  const correct = item !== undefined && item.kind !== "compare" && selectedIndex === item.answerIndex;
  const autoAdvance = !skipped && (mode === "placement" || mode === "unit-test" || correct);
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  const feedbackSoundEnabled = soundMode === "on";
  const recall = (correction || mode === "review" || mode === "level-review") && item?.kind !== "compare";

  useEffect(() => {
    advancing.current = false;
    if (item?.kind !== "compare") answerTimer.reset(!pausedRef.current && document.visibilityState !== "hidden");
  }, [answerTimer, index, item?.kind]);

  function pick(choice: number | null) {
    if (!item || item.kind === "compare" || pausedRef.current || selectedIndex !== null || answerLocked.current) return;
    answerLocked.current = true;
    const isSkipped = choice === null;
    const isCorrect = choice === item.answerIndex;
    const answer = item.options[item.answerIndex]?.label ?? "";
    const displayedAnswer = item.track === "jp" && onyomiScript === "hiragana" ? toHiragana(answer) : answer;
    if (correction) {
      setSelectedIndex(choice);
      setSkipped(isSkipped);
      setSessionAnnouncement((current) => ({ sequence: current.sequence + 1, text: isCorrect ? "다시 떠올렸습니다. 추가 점수 없이 연습을 마쳤습니다." : `아직 기억하지 못했습니다. 정답은 ${displayedAnswer}입니다.` }));
      return;
    }
    const elapsedMs = answerTimer.snapshot();
    const answeredAt = new Date();
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
        setSessionAnnouncement((current) => ({
          sequence: current.sequence + 1,
          text: isSkipped ? `모름을 선택했습니다. 정답은 ${displayedAnswer}입니다.` : "응답을 기록했습니다. 다음 문항으로 이동합니다.",
        }));
      } else {
        const cardIndex = issuedUnitTestCard?.cardIndex ?? index;
        const mistakes = unitTestMistakes + Number(!isCorrect);
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
      const ids = item.kind === "word" ? item.word.members.map((member) => member.characterId) : [item.character.id];
      const results = ids.map((id) => {
        const key = reviewKey(id, item.track);
        const state = states.get(key) ?? initialState(answeredAt);
        const scheduleTime = new Date(Math.max(answeredAt.getTime(), state.lastReview?.getTime() ?? answeredAt.getTime()));
        const result = schedule(state, gradeFromReview(isCorrect, isSkipped, elapsedMs), scheduleTime);
        states.set(key, result.next);
        return result;
      });
      interval = intervalLabel(results[0].next.scheduledDays);
      if (isCorrect) setSessionAnnouncement((current) => ({ sequence: current.sequence + 1, text: "정답입니다. 다음 문항으로 이동합니다." }));
    }
    const answeredIndex = index;
    if (mode !== "unit-test") submit({ cardIndex: issuedNormalCard?.originalCardIndex ?? index, answeredAt: answeredAt.toISOString(), characterKey: item.character.key, ...(item.kind === "word" ? { wordId: item.word.id } : {}), track: item.track, correct: isCorrect, skipped: isSkipped, elapsedMs, mode }, (response) => {
      if (currentIndex.current === answeredIndex && mode !== "placement") setNextInterval(response.dueLabel);
    });
    const gained = isCorrect ? correctAnswerXp(combo) : 0;
    const nextCombo = isCorrect ? combo + 1 : 0;
    if (!isCorrect && combo >= 3) setLostCombo(combo);
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
    if (normalMode && !isCorrect) setNormalQueue((current) => insertCorrection(current, index));
    if (isCorrect) {
      if (feedbackSoundEnabled) playCorrect(nextCombo);
      if (!reducedMotion) buzz(nextCombo >= 6 ? "combo" : "correct");
      const tier = nextCombo >= 6 ? 3 : nextCombo >= 3 ? 2 : 1;
      const option = choice === null ? undefined : runnerRef.current?.querySelectorAll<HTMLElement>(".answer-option")[choice];
      const optionRect = option?.getBoundingClientRect();
      const runnerRect = runnerRef.current?.getBoundingClientRect();
      if (optionRect && runnerRect) setBursts((current) => [...current.slice(-2), {
        anchor: { x: optionRect.left - runnerRect.left + optionRect.width / 2, y: optionRect.top - runnerRect.top + optionRect.height / 2, width: optionRect.width, height: optionRect.height },
        id: nextBurstId.current += 1, tier, track: item.track,
      }]);
    } else {
      if (feedbackSoundEnabled) (isSkipped ? playSkip : playWrong)();
      if (!reducedMotion) buzz(isSkipped ? "skip" : "wrong");
    }
  }

  function revealAnswer() {
    if (!recall || pausedRef.current || recallState !== "concealed" || answerLocked.current) return;
    answerTimer.pause();
    setRecallState("revealed");
    setSessionAnnouncement((current) => ({ sequence: current.sequence + 1, text: "정답을 공개했습니다. 떠올린 답과 비교한 뒤 직접 평가하세요." }));
  }

  function showChoices() {
    if (!recall || pausedRef.current || recallState !== "concealed" || answerLocked.current) return;
    setRecallState("choices");
  }

  function gradeRecall(remembered: boolean) {
    if (!item || item.kind === "compare") return;
    pick(remembered ? item.answerIndex : null);
  }

  function advance() {
    if (pausedRef.current || advancing.current || !item || (item.kind !== "compare" && !answered)) return;
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
    } else if (mode === "unit-test" ? unitTestMistakes >= 3 || index + 1 >= unitTestQueue.length : index + 1 >= (normalMode ? normalQueue.length : queue.length)) {
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
    setLostCombo(0);
    setRecallState("concealed");
  }

  function pauseSession() {
    answerTimer.pause();
    pausedRef.current = true;
    setPaused(true);
  }

  function resumeSession() {
    pausedRef.current = false;
    if (!answered && !compare && !answerLocked.current && (!recall || recallState !== "revealed")) answerTimer.resume();
    setPaused(false);
  }

  // Android back pauses the session (or closes the pause dialog) instead of leaving it mid-card.
  // The native listener is registered once; the ref always runs the latest render's handlers.
  const backRef = useRef(() => undefined as void);
  useEffect(() => {
    backRef.current = () => { if (pausedRef.current) resumeSession(); else pauseSession(); };
  });
  useEffect(() => onBackButton(() => backRef.current()), []);

  useEffect(() => {
    function pauseWhenHidden() {
      if (document.visibilityState === "hidden") pauseSession();
    }
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => document.removeEventListener("visibilitychange", pauseWhenHidden);
  });

  useEffect(() => {
    advanceRef.current = advance;
  });

  useEffect(() => {
    if (recallState === "revealed") recallResultRef.current?.focus();
  }, [recallState]);

  useEffect(() => {
    if (paused || focusedCardIndex.current === index) return;
    quizCardRef.current?.focus();
    focusedCardIndex.current = index;
  }, [index, paused]);

  useEffect(() => {
    if (!answered || !autoAdvance || paused) return;
    const timer = window.setTimeout(() => advanceRef.current(), autoAdvanceDelay(mode, correct, reducedMotion));
    return () => window.clearTimeout(timer);
  }, [answered, autoAdvance, correct, index, mode, paused, reducedMotion]);

  useSessionKeys({
    active: Boolean(item) && !paused,
    answered,
    compare,
    onPick: pick,
    onSkip: () => pick(null),
    onAdvance: advance,
    onPause: pauseSession,
    recall: recall ? recallState : undefined,
    onReveal: revealAnswer,
    onRecall: gradeRecall,
  });

  if (!item) {
    if (mode === "lesson") return <div className="session-empty"><h1>활성화된 트랙에 학습할 콘텐츠가 부족합니다.</h1><p>설정에서 다른 트랙을 활성화하거나 복습 큐를 확인해 주세요.</p><Link to="/settings">설정으로 가기</Link><Link to="/review">복습 큐로 가기</Link><button onClick={onQuit} type="button">지도로 돌아가기</button></div>;
    if (mode === "placement") return <div className="session-empty"><h1>배치에 필요한 콘텐츠가 부족합니다.</h1><p>트랙 선택을 바꾼 뒤 다시 시작해 주세요.</p><button onClick={onQuit} type="button">트랙 선택으로 돌아가기</button></div>;
    if (mode === "unit-test") return <div className="session-empty"><h1>유닛 테스트를 만들 수 없습니다.</h1><p>이 유닛의 문항 구성을 확인해 주세요.</p><button onClick={onQuit} type="button">지도로 돌아가기</button></div>;
    return <div className="session-empty"><h1>복습할 카드가 없습니다.</h1><button onClick={onQuit} type="button">복습 큐로 돌아가기</button></div>;
  }
  const source = item.character.sentences.find((sentence) => sentence.track === item.track)?.source;
  const entry = item.character.tracks.find((candidate) => candidate.track === item.track);
  const word = item.kind === "word" ? item.word : undefined;
  const wordSource = word ? wordAttribution(word.sourceUrl)?.source ?? word.sourceUrl : "";
  const wordFeedback = word ? item.track === "jp"
    ? `${wordSource}の${wordLabels.jp.name}です。`
    : item.track === "cn"
      ? `这是${wordSource}收录的${wordLabels.cn.name}。`
      : `${wordSource}의 ${wordLabels.kr.name}입니다.` : "";
  const reading = entry ? readingFor(entry).label : "";
  const displayedReading = item.track === "jp" && onyomiScript === "hiragana" ? toHiragana(reading) : reading;
  const feedbackNote = compare
    ? "이미 아는 글자를 다른 트랙과 함께 확인합니다."
    : mode === "unit-test"
      ? answered
        ? correct ? "좋아요. 바로 다음 문항으로 넘어갑니다." : unitTestMistakes >= 3 ? "하트를 모두 사용했습니다." : "틀린 문항은 뒤에서 다시 나옵니다."
        : "같은 글자도 다른 보기로 다시 출제됩니다."
    : mode === "placement"
      ? answered ? "응답에 맞춰 시작 급수를 조정했습니다." : "정답에 따라 다음 문항 난이도가 바뀝니다."
    : !answered
      ? word ? wordFeedback : source ? `${source}에서 발췌` : "이 글자는 출처가 확인된 예문이 없습니다."
      : correct
        ? `다음 복습: ${nextInterval}`
        : word ? `${word.glyph} = ${word.reading}` : `${entry?.glyph} = ${
            item.kind === "meaning" ? meaningFor(item.character, item.track).label
              : item.kind === "kun" && entry?.track === "jp" ? entry.kun
              : displayedReading
          }`;
  const style = {
    "--session-accent": tracks[item.track].accent,
    "--session-accent-text": tracks[item.track].accentText,
    "--session-soft": tracks[item.track].soft,
    "--session-font": tracks[item.track].font,
  } as CSSProperties;
  const displayOptions = item.kind !== "compare" && item.kind !== "meaning" && item.track === "jp" && onyomiScript === "hiragana"
    ? item.options.map((option) => ({ ...option, label: toHiragana(option.label) }))
    : item.kind !== "compare" ? item.options : [];
  const answerLang = item.kind === "meaning" ? item.track === "cn" ? "en" : "ko" : trackThemes[item.track].lang;
  const recallPrompt = recallPromptFor(item.kind, item.track);
  const correctionText = correction && answered && item.kind !== "compare"
    ? correct ? "다시 떠올렸어요" : <>아직 기억하지 못함 · 정답 <span lang={answerLang}>{displayOptions[item.answerIndex]?.label}</span></>
    : undefined;

  return (
    <section className={`session-runner${mode === "unit-test" ? " session-runner--unit-test" : ""}`} ref={runnerRef} style={style}>
      <div className="session-chrome">
        <button aria-label="세션 일시정지" onClick={pauseSession} type="button">esc</button>
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
          <ParticleBurst anchor={burst.anchor} key={burst.id} onDone={() => setBursts((current) => current.filter(({ id }) => id !== burst.id))} tier={burst.tier} track={burst.track} />
        ))}
      </div>
      <div className="session-card-wrap" key={index}>
        {correction && <p className="session-correction-label"><span>오답 다시 떠올리기 · 추가 점수 없음</span><small>남은 오답 연습 {remainingCorrections}개</small></p>}
        <QuizCard answerRevealed={recall ? recallState === "revealed" || answered : undefined} answered={answered} character={item.character} compare={compare} correct={correct} kind={item.kind} onyomiScript={onyomiScript} promptOverride={mode === "placement" ? `배치 문항 ${progress}/${queueLength}` : mode === "unit-test" ? `유닛 테스트 ${progress}/${queueLength}` : recall ? recallPrompt : undefined} ref={quizCardRef} track={item.track} word={word} />
        {item.kind !== "compare" && (
          <>
            {recall && recallState === "concealed" ? <div className="recall-actions"><button className="recall-reveal" onClick={revealAnswer} type="button">정답 확인 <kbd>ENTER</kbd></button><button onClick={showChoices} type="button">보기로 풀기</button></div> : recall && recallState === "revealed" && !answered ? <div className="recall-check" aria-label="회상 결과"><p ref={recallResultRef} tabIndex={-1}>정답 <strong lang={answerLang}>{displayOptions[item.answerIndex]?.label}</strong></p><small>공개된 답을 알아본 것은 회상 성공으로 세지 마세요.</small><div><button onClick={() => pick(null)} type="button">기억하지 못함 <kbd>1</kbd></button><button onClick={() => pick(item.answerIndex)} type="button">정확히 기억함 <kbd>2</kbd></button></div></div> : <><AnswerOptions answerIndex={item.answerIndex} lang={answerLang} onPick={(choice) => void pick(choice)} options={displayOptions} selectedIndex={selectedIndex} spent={answered} /><SkipAnswer disabled={answered} onSkip={() => pick(null)} /></>}
          </>
        )}
        <FeedbackBar
          answered={answered}
          compare={compare}
          correct={correct}
          skipped={skipped}
          correctAnswer={item.kind !== "compare" ? displayOptions[item.answerIndex]?.label : undefined}
          correctAnswerLang={answerLang}
          correctIndex={item.kind !== "compare" ? item.answerIndex : 0}
          cardIndex={index}
          combo={combo}
          last={mode === "placement" && !externalQueue ? index + 1 === length : index + 1 === (normalMode ? normalQueue.length : queue.length)}
          note={correction ? "이 연습은 점수와 복습 일정에 반영되지 않습니다." : feedbackNote}
          onNext={advance}
          lostCombo={lostCombo}
          xp={correction ? undefined : lastXp}
          autoAdvance={autoAdvance}
          idleText={recall ? recallState === "revealed" ? "정답을 비교하고 직접 평가하세요" : recallState === "choices" ? "1–4 중에 골라보세요" : "먼저 답을 떠올려 보세요" : undefined}
          answeredText={correctionText}
        />
      </div>
      {paused && <PauseModal onQuit={onQuit} onResume={resumeSession} />}
    </section>
  );
}
