/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-unsafe-dictionary-type -- Existing API config boundary parser predates changed-file lint; this additive request type must keep its shared contract. */
import type { SlotDrillSlot } from "./slotDrill";
import type { ConversationChunk, ConversationRegister, ConversationScene, ConversationSceneTurn, ConversationUnit, Track } from "./types";
import type { OnyomiScript, SoundMode } from "./settings";

// Four two-character word reviews use 37 SQL statements including profile resolution.
export const MAX_REVIEW_BATCH_SIZE = 4;
export const PROFILE_EXPECTATION_HEADER = "x-hanja-profile-id";
// Native clients send SESSION_TRANSPORT_HEADER: "bearer" when selecting,
// unlocking, or recovering to receive `sessionToken` in the JSON body instead of
// a cookie, then authenticate with `Authorization: Bearer`. Bearer-authenticated
// responses carry the renewed token in SESSION_TOKEN_HEADER.
export const SESSION_TRANSPORT_HEADER = "x-hanja-session-transport";
export const SESSION_TOKEN_HEADER = "x-hanja-session";
// Store-installed apps outlive Worker deploys. Bump API_COMPAT_VERSION in the same
// change as an API break that older clients cannot handle (removed or renamed routes,
// fields, or meanings); additive fields and routes never bump it. Raise the Worker's
// MIN_CLIENT_COMPAT_VERSION only once the store build carrying the bump is released.
export const API_COMPAT_VERSION = 1;
export type ClientConfigResponse = { minCompatVersion: number };

// Unknown or malformed config never blocks: an offline or older Worker must not lock learners out.
export function clientUpdateRequired(config: unknown, current = API_COMPAT_VERSION): boolean {
  const minimum = typeof config === "object" && config !== null ? (config as Record<string, unknown>).minCompatVersion : undefined;
  return Number.isSafeInteger(minimum) && (minimum as number) > current;
}

export type ApiErrorBody = { error: { code: string; message: string } };
export type PinStateResponse = { enabled: boolean; locked: boolean; lockedUntil: number | null };
export type PublicProfile = { id: number; name: string; hasPin: boolean; isAdmin: boolean };
export type ProfilesResponse = { profiles: PublicProfile[] };
export type ManagedProfile = Pick<PublicProfile, "id" | "name" | "isAdmin">;
export type CreateProfileRequest = { name: string; pin?: string };
export type RenameProfileRequest = { name: string };

export type CurriculumNode = {
  key: string;
  glyph: string;
  reading: string;
  state: "done" | "current" | "locked";
};

export type CurriculumUnitPayload = {
  id: number;
  level: string;
  levelOrd: number;
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
  reading: string | null;
  translation: string;
  source: string;
  target_index: number | null;
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
  meaning: string;
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

export type UnitStudyTrackDetail = {
  track: Track;
  glyph: string;
  reading: string;
  subreading?: string;
  meaning: string;
  level_badges: string[];
  sentences: ApiSentence[];
};

export type UnitStudyResponse = {
  unit: { id: number; track: Track; level: string; ord: number; title: string; subtitle: string };
  characters: Array<{
    key: string;
    meaning_en: string;
    meaning_ko: string;
    tracks: UnitStudyTrackDetail[];
  }>;
};

export type SessionMode = "lesson" | "review" | "level-review" | "placement";
export type SessionOption = { label: string };
export type SessionCompareEntry = { glyph: string; reading: string; levelBadge: string };

export type SessionCard = {
  kind: "reading" | "meaning" | "kun" | "compare" | "word";
  characterKey: string;
  meaningKo: string;
  meaning: string;
  reading: string;
  kun?: string;
  track: Track;
  glyph: string;
  levelBadge: string;
  levelOrd: number;
  trackBadge: string;
  prompt: string;
  sentence: { text: string; reading: string | null; translation: string; source: string; targetIndex: number | null } | null;
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
  answeredAt?: string;
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

export type ConversationGrade = "again" | "hard" | "good" | "easy";
export type ConversationLoop = "echo" | "shadow" | "drill" | "roleplay" | "free";
export type ConversationInput = "voice" | "tap" | "keyboard";

export type SubmitConversationAttemptRequest = {
  clientAttemptId: string;
  chunkId: number;
  // Slot drill attempt: chunkId is the template's pattern chunk, FSRS state is written per template.
  templateId?: number;
  sceneId?: number | null;
  role: "say" | "hear";
  grade: ConversationGrade;
  answeredAt: number;
  latencyMs?: number | null;
  hints?: number;
  replays?: number;
  loop?: ConversationLoop;
  input?: ConversationInput;
};

export type SubmitConversationAttemptResponse = { grade: ConversationGrade };

export type ConversationChunkPayload = ConversationChunk & { audioUrl: string };
export type ConversationScenePayload = ConversationScene & { turns: ConversationSceneTurn[] };
export type ConversationTemplatePayload = {
  id: number;
  key: string;
  unitId: number;
  ord: number;
  jaTemplate: string;
  kanaTemplate: string;
  cueKo: string;
  register: ConversationRegister;
  patternChunkId: number;
  slots: SlotDrillSlot[];
};
export type ConversationSessionItem =
  | { kind: "drill"; template: ConversationTemplatePayload }
  | { kind: "chunk"; phase: "hear" | "say" | "new"; chunk: ConversationChunkPayload }
  | { kind: "scene"; scene: ConversationScenePayload; review: boolean };
export type ConversationSessionResponse = {
  unit: ConversationUnit;
  chunks: ConversationChunkPayload[];
  items: ConversationSessionItem[];
};

export type ConversationStatsResponse = {
  calendar: StatsCalendarDay[];
  spokenDaysThisWeek: number;
  checkinsThisWeek: number;
  spokenChunkRetention: number | null;
  unaidedFirstTryRate: number | null;
  medianOnsetLatencyMs: number | null;
  transferRate: number | null;
};

export type ConversationCheckin = { unitId: number; at: number; note: string };
export type SubmitConversationCheckinRequest = { unitId: number; note: string };

export type ConversationPhraseProgress = {
  id: number;
  unitId: number;
  ord: number;
  ja: string;
  kana: string;
  koCue: string;
  sourceKind: string;
  sourceRef: string;
  spokenDays: number;
  againCount: number;
};

export type ConversationUnitProgress = {
  id: number;
  ord: number;
  titleKo: string;
  goalKo: string;
  phraseCount: number;
  completedPhraseCount: number;
  checkin: ConversationCheckin | null;
};

export type ConversationProgressResponse = {
  units: ConversationUnitProgress[];
  phrases: ConversationPhraseProgress[];
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
  sessionId?: string;
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
  id: number;
  name: string;
  isAdmin: boolean;
  // True for guest profiles from POST /api/demo/session (optional: older Workers omit it).
  isGuest?: boolean;
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

export type SettingsResponse = { enabledTracks: Track[]; dailyGoal: number; timezone: string; onyomiScript: OnyomiScript; soundMode: SoundMode; isAdmin: boolean };
export type PatchSettingsRequest = { enabledTracks?: Track[]; dailyGoal?: number; timezone?: string; onyomiScript?: OnyomiScript; soundMode?: SoundMode };
export type OnboardingStateResponse = { onboarded: boolean };

export type StatsCalendarDay = { date: string; count: number };
export type StatsSecondaryScale = { name: "漢検"; level: string; known: number; total: number; nextLevel?: string };
export type StatsTrack = { track: Track; known: number; total: number; pct: number; currentLevel: string; nextLevel?: string; secondaryScale?: StatsSecondaryScale };
export type StatsResponse = { streak: number; longestStreak: number; calendar: StatsCalendarDay[]; tracks: StatsTrack[]; answered: number; skipped: number; skipRate: number };
