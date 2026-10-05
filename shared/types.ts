export const TRACKS = ["kr", "jp", "cn"] as const;
export type Track = (typeof TRACKS)[number];

export type SourceKind = "textbook" | "past_paper" | "corpus";

export const CONVERSATION_ROLES = ["say", "hear"] as const;
export type ConversationRole = (typeof CONVERSATION_ROLES)[number];

export const CONVERSATION_REGISTERS = ["polite", "casual", "keigo"] as const;
export type ConversationRegister = (typeof CONVERSATION_REGISTERS)[number];

export const CONVERSATION_SOURCE_KINDS = ["corpus", "excerpt", "jmdict", "authored"] as const;
export type ConversationSourceKind = (typeof CONVERSATION_SOURCE_KINDS)[number];

export interface ConversationUnit {
  id: number;
  track: "jp";
  ord: number;
  titleKo: string;
  goalKo: string;
}

export interface ConversationChunk {
  id: number;
  key?: string;
  track?: "jp";
  unitId: number;
  ord: number;
  ja: string;
  kana: string;
  koCue: string;
  register: ConversationRegister;
  role: ConversationRole;
  sourceKind: string;
  sourceRef: string;
  audioKey: string;
  retiredAt?: number | null;
}

export interface ConversationScene {
  id: number;
  unitId: number;
  ord: number;
  titleKo: string;
  settingKo: string;
  goalKo: string;
}

export interface ConversationSceneTurn {
  sceneId: number;
  ord: number;
  speaker: "npc" | "learner";
  chunkIds: number[];
}

export interface ConversationChunkState {
  profileId: number;
  chunkId: number;
  role: ConversationRole;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: number | null;
  due: number;
  correctCount: number;
  totalCount: number;
}

export interface ConversationAttempt {
  id: number;
  profileId: number;
  clientAttemptId: string;
  chunkId: number;
  sceneId: number | null;
  role: ConversationRole;
  grade: 1 | 2 | 3 | 4;
  answeredAt: number;
  latencyMs: number | null;
}

export interface SeedConversationUnit {
  ord: number;
  titleKo: string;
  goalKo: string;
}

export interface SeedConversationChunk {
  key: string;
  unitOrd: number;
  ord: number;
  text: string;
  kana: string;
  cueKo: string;
  register: ConversationRegister;
  role: ConversationRole;
  sourceKind: ConversationSourceKind;
  sourceRef?: string;
  ownerApproved?: string;
  audioKey: string;
}

export interface SeedConversationSceneTurn {
  ord: number;
  speaker: "npc" | "learner";
  chunkOrds: number[];
}

export interface SeedConversationScene {
  unitOrd: number;
  ord: number;
  titleKo: string;
  settingKo: string;
  goalKo: string;
  turns: SeedConversationSceneTurn[];
}

export interface SeedConversationDocument {
  units: SeedConversationUnit[];
  chunks: SeedConversationChunk[];
  scenes: SeedConversationScene[];
}

export interface ExampleSentence {
  id: number;
  characterId: number;
  track: Track;
  text: string;
  reading: string | null;
  translationKo: string;
  source: string;
  sourceKind: SourceKind;
  targetIndex: number | null;
  rank: number;
}

interface TrackEntryBase {
  characterId: number;
  glyph: string;
  levelOrd: number;
}

export interface KrTrackEntry extends TrackEntryBase {
  track: "kr";
  reading: string;
  level: string;
}

export interface JpTrackEntry extends TrackEntryBase {
  track: "jp";
  on: string;
  kun: string;
  kanken: string;
  jlpt: string;
}

export interface CnTrackEntry extends TrackEntryBase {
  track: "cn";
  pinyin: string;
  meaning: string;
  hsk: string;
  tier: string;
}

export type TrackEntry = KrTrackEntry | JpTrackEntry | CnTrackEntry;

export interface CharacterEntry {
  id: number;
  key: string;
  meaningEn: string;
  meaningKo: string;
  variants: Partial<Record<Track, string>>;
  strokeCount: number | null;
  createdAt: number;
  tracks: TrackEntry[];
  sentences: ExampleSentence[];
}

export interface WordEntry {
  id: number;
  track: Track;
  glyph: string;
  reading: string;
  level: string;
  levelOrd: number;
  sourceUrl: string;
  members: Array<{ characterId: number; key: string; position: number }>;
}

export interface CurriculumUnitMember {
  characterId: number;
  key: string;
  ord: number;
}

export interface CurriculumUnit {
  id: number;
  track: Track;
  level: string;
  ord: number;
  title: string;
  subtitle: string;
  members: CurriculumUnitMember[];
}

export type SeedSentence = Omit<ExampleSentence, "id" | "characterId" | "track">;

type SeedTrack<T extends TrackEntry> = Omit<T, "characterId"> & {
  sentences?: SeedSentence[];
};

export type SeedTrackEntry =
  | SeedTrack<KrTrackEntry>
  | SeedTrack<JpTrackEntry>
  | SeedTrack<CnTrackEntry>;

export interface SeedCharacterEntry {
  key: string;
  meaningEn: string;
  meaningKo: string;
  variants: Partial<Record<Track, string>>;
  strokeCount: number | null;
  tracks: SeedTrackEntry[];
}

export interface SeedCurriculumUnit {
  track: Track;
  level: string;
  ord: number;
  title: string;
  subtitle: string;
  members: Array<{ key: string; ord: number }>;
}

export interface SeedDocument {
  characters: SeedCharacterEntry[];
  curriculumUnits?: SeedCurriculumUnit[];
}

export interface SeedSentenceEntry extends SeedSentence {
  characterKey: string;
  track: Track;
}

export interface SeedSentenceDocument {
  sentences: SeedSentenceEntry[];
}

export interface SeedWordEntry {
  track: Track;
  glyph: string;
  reading: string;
  level: string;
  levelOrd: number;
  sourceUrl: string;
  members: string[];
}

export interface SeedWordDocument {
  words: SeedWordEntry[];
}
