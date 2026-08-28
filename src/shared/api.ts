import type { Track } from "./types";

export type ApiErrorBody = { error: { code: string; message: string } };

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
export type SessionOption = { label: string; sub: string };
export type SessionCompareEntry = { glyph: string; reading: string; levelBadge: string };

export type SessionCard = {
  kind: "reading" | "compare";
  characterKey: string;
  track: Track;
  glyph: string;
  levelBadge: string;
  trackBadge: string;
  prompt: string;
  sentence: { text: string; translation: string; source: string; targetIndex: number } | null;
  options: SessionOption[];
  answerIndex: number;
  compare?: Partial<Record<Track, SessionCompareEntry>>;
};

export type StartSessionRequest = { mode: SessionMode; tracks: Track[]; limit?: number };
export type StartSessionResponse = { sessionId: string; cards: SessionCard[] };
