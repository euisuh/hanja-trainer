export const TRACKS = ["kr", "jp", "cn"] as const;
export type Track = (typeof TRACKS)[number];

export type SourceKind = "textbook" | "past_paper" | "corpus";

export interface ExampleSentence {
  id: number;
  characterId: number;
  track: Track;
  text: string;
  translationKo: string;
  source: string;
  sourceKind: SourceKind;
  targetIndex: number;
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
  track: "kr";
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
  track: "kr";
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
