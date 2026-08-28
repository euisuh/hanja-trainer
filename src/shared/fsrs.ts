import {
  Rating,
  State,
  createEmptyCard,
  fsrs,
  type Card,
  type CardInput,
  type Grade as FsrsGrade,
} from "ts-fsrs";

export type Grade = "again" | "hard" | "good" | "easy";

export interface ReviewState {
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: State;
  lastReview: Date | null;
  due: Date;
  correctCount: number;
  totalCount: number;
}

export interface ReviewLogEntry {
  rating: Grade;
  answeredAt: Date;
  scheduledDaysBefore: number;
  scheduledDaysAfter: number;
}

// Answer-speed tuning knobs; adjust after real session timing data exists.
export const ANSWER_SPEED_MS = { fast: 3_000, slow: 12_000 } as const;

const DAY_MS = 86_400_000;
const ratings: Record<Grade, FsrsGrade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

function fromCard(card: Card, correctCount: number, totalCount: number): ReviewState {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ?? null,
    due: card.due,
    correctCount,
    totalCount,
  };
}

function toCard(state: ReviewState): CardInput {
  return {
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsedDays,
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningSteps,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state,
    last_review: state.lastReview,
    due: state.due,
  };
}

export function initialState(now: Date): ReviewState {
  return fromCard(createEmptyCard(now), 0, 0);
}

export function schedule(
  state: ReviewState,
  grade: Grade,
  now: Date,
): { next: ReviewState; log: ReviewLogEntry } {
  const result = fsrs().next(toCard(state), now, ratings[grade]);
  return {
    next: fromCard(
      result.card,
      state.correctCount + Number(grade !== "again"),
      state.totalCount + 1,
    ),
    log: {
      rating: grade,
      answeredAt: now,
      scheduledDaysBefore: state.scheduledDays,
      scheduledDaysAfter: result.card.scheduled_days,
    },
  };
}

export function gradeFromAnswer(correct: boolean, elapsedMs: number): Grade {
  if (!correct) return "again";
  if (elapsedMs <= ANSWER_SPEED_MS.fast) return "easy";
  if (elapsedMs >= ANSWER_SPEED_MS.slow) return "hard";
  return "good";
}

export function isDue(state: ReviewState, now: Date): boolean {
  return state.due.getTime() <= now.getTime();
}

export function dueSort(states: ReviewState[], now: Date): ReviewState[] {
  return [...states].sort(
    (a, b) => a.due.getTime() - now.getTime() - (b.due.getTime() - now.getTime()),
  );
}

export function formatDueLabel(
  state: ReviewState,
  now: Date,
): { label: string; overdue: boolean } {
  const utcDay = (date: Date) =>
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY_MS;
  const days = utcDay(state.due) - utcDay(now);
  if (days === 0) return { label: "오늘 만기", overdue: false };
  return days < 0
    ? { label: `${Math.abs(days)}일 지남`, overdue: true }
    : { label: `${days}일 후`, overdue: false };
}

export function intervalHistory(log: ReviewLogEntry[]): number[] {
  return log.map((entry) => entry.scheduledDaysAfter);
}
