import type { Track } from "./types";
import type { OnyomiScript } from "./settings";

export type ApiErrorBody = { error: { code: string; message: string } };
export type PinStateResponse = { enabled: boolean; locked: boolean; lockedUntil: number | null };

export type CurriculumNode = {
  key: string;
  glyph: string;
  reading: string;
  state: "done" | "current" | "locked";
};

export type CurriculumUnitPayload = {
  id: number;
  level: string;
  ord: number;
  title: string;
  subtitle: string;
  progress: { known: number; total: number };
  nodes: CurriculumNode[];
  current: boolean;
};

export type CurriculumResponse = { units: CurriculumUnitPayload[] };

export type ApiSentence = {
  text: string;
  translation: string;
  source: string;
  target_index: number;
};

export type ApiReviewState = {
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  due: string;
  correct_count: number;
  total_count: number;
  interval_history: number[];
};

export type ApiTrackDetail = {
  track: Track;
  glyph: string;
  reading: string;
  subreading?: string;
  level_badges: string[];
  sentences: ApiSentence[];
  review_state: ApiReviewState | null;
};

export type CharacterDetailResponse = {
  key: string;
  variants: Partial<Record<Track, string>>;
  meaning_en: string;
  meaning_ko: string;
  tracks: ApiTrackDetail[];
};

export type SessionMode = "lesson" | "review" | "placement";
export type SessionOption = { label: string };
export type SessionCompareEntry = { glyph: string; reading: string; levelBadge: string };

export type SessionCard = {
  kind: "reading" | "compare" | "word";
  characterKey: string;
  meaningKo: string;
  track: Track;
  glyph: string;
  levelBadge: string;
  levelOrd: number;
  trackBadge: string;
  prompt: string;
  sentence: { text: string; translation: string; source: string; targetIndex: number } | null;
  options: SessionOption[];
  answerIndex: number;
  compare?: Partial<Record<Track, SessionCompareEntry>>;
  wordId?: number;
  memberKeys?: string[];
  wordSourceUrl?: string;
};

export type StartSessionRequest = { mode: SessionMode; tracks: Track[]; limit?: number; unitId?: number; levelOrd?: number; testOut?: true };
export type StartSessionResponse = {
  sessionId: string;
  cards: SessionCard[];
  shortage?: { code: "insufficient_content"; tracks: Track[]; message: string };
};

export type UnitTestAnswer = { cardIndex: number; characterKey: string; selectedIndex: number | null };
export type UnitTestResult = { passed: boolean; correct: number; total: number; required: number; mistakes: number };

export type SubmitReviewRequest = {
  sessionId: string;
  cardIndex: number;
  characterKey: string;
  wordId?: number;
  track: Track;
  correct: boolean;
  skipped: boolean;
  elapsedMs: number;
  mode: SessionMode;
};

export type SubmitReviewResponse = {
  due: string;
  scheduledDays: number;
  stability: number;
  difficulty: number;
  dueLabel: string;
};

export type DueReviewCard = {
  characterKey: string;
  track: Track;
  glyph: string;
  reading: string;
  dueAt: string;
  overdueDays: number;
  stability: number;
};

export type DueReviewsResponse = { total: number; cards: DueReviewCard[] };

export type CreateSessionRequest = {
  mode: SessionMode;
  startedAt: string;
  endedAt: string;
  answered: number;
  correct: number;
  skipped: number;
  bestCombo: number;
  xp: number;
};

export type ProfileResponse = {
  xp: number;
  todayXp: number;
  goal: number;
  streak: number;
  longestStreak: number;
  enabledTracks: Track[];
};

export type PlacementAnswer = { characterKey: string; track: Track; correct: boolean; skipped: boolean; levelOrd: number };
export type PlacementScoreResult = { track: Track; levelOrd: number; levelBadge: string; knownCount: number; totalSeen: number; accuracy: number; saturated: boolean; floored: boolean; detail: string };
export type PlacementScoreResponse = { results: PlacementScoreResult[] };

export type SettingsResponse = { enabledTracks: Track[]; dailyGoal: number; timezone: string; onyomiScript: OnyomiScript };
export type PatchSettingsRequest = { enabledTracks?: Track[]; dailyGoal?: number; timezone?: string; onyomiScript?: OnyomiScript };
export type OnboardingStateResponse = { onboarded: boolean };

export type StatsCalendarDay = { date: string; count: number };
export type StatsSecondaryScale = { name: "JLPT"; level: string; known: number; total: number; nextLevel?: string };
export type StatsTrack = { track: Track; known: number; total: number; pct: number; currentLevel: string; nextLevel?: string; secondaryScale?: StatsSecondaryScale };
export type StatsResponse = { streak: number; longestStreak: number; calendar: StatsCalendarDay[]; tracks: StatsTrack[]; answered: number; skipped: number; skipRate: number };
