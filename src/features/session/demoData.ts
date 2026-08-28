import sampleSeed from "../../../data/characters.sample.json";
import cnSentences from "../../../data/sentences/cn-hsk1.json";
import jpSentences from "../../../data/sentences/jp-kanken-10.json";
import krSentences from "../../../data/sentences/kr-8geup.json";
import { initialState, schedule, type ReviewLogEntry, type ReviewState } from "../../shared/fsrs";
import type { CharacterEntry, SeedCharacterEntry, TrackEntry } from "../../shared/types";
import { reviewKey } from "./buildQueue";

type SourceSentence = {
  character_key: string;
  track: "kr" | "jp" | "cn";
  text: string;
  translation_ko: string;
  source: string;
  source_kind: "textbook" | "past_paper" | "corpus";
  target_index: number;
  rank: number;
};

const rawSentences = [...krSentences.sentences, ...jpSentences.sentences, ...cnSentences.sentences] as SourceSentence[];
const sentencesByPair = new Map<string, SourceSentence[]>();
for (const sentence of rawSentences) {
  const key = `${sentence.character_key}:${sentence.track}`;
  sentencesByPair.set(key, [...(sentencesByPair.get(key) ?? []), sentence]);
}

function sentenceOffset(track: "kr" | "jp" | "cn"): number {
  return track === "kr" ? 1 : track === "jp" ? 2 : 3;
}

// ponytail: compact real-data demo; replace with #14's curriculum/session endpoint.
export const demoCharacters: CharacterEntry[] = (sampleSeed as SeedCharacterEntry[]).map((character, index) => {
  const id = index + 1;
  const tracks = character.tracks.map((entry) => {
    const track = { ...entry, characterId: id };
    delete track.sentences;
    return track as TrackEntry;
  });
  const sentences = tracks.flatMap((entry) => (sentencesByPair.get(`${character.key}:${entry.track}`) ?? []).map((source) => ({
      id: id * 100 + sentenceOffset(entry.track) * 10 + source.rank,
      characterId: id,
      track: entry.track,
      text: source.text,
      translationKo: source.translation_ko,
      source: source.source,
      sourceKind: source.source_kind,
      targetIndex: source.target_index,
      rank: source.rank,
    })));
  return { id, key: character.key, meaningEn: character.meaningEn, meaningKo: character.meaningKo, variants: character.variants, strokeCount: character.strokeCount, createdAt: 0, tracks, sentences };
});

type StoredState = Omit<ReviewState, "due" | "lastReview"> & { due: string; lastReview: string | null };
const storageKey = "hanja-trainer.review-states";
const logStorageKey = "hanja-trainer.review-logs";
type StoredLog = Omit<ReviewLogEntry, "answeredAt"> & { answeredAt: string };

function parseStoredState(state: StoredState): ReviewState {
  return { ...state, due: new Date(state.due), lastReview: state.lastReview ? new Date(state.lastReview) : null };
}

export function loadDemoStates(): Map<string, ReviewState> {
  const states = new Map<string, ReviewState>();
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<string, StoredState>;
    for (const [key, state] of Object.entries(stored)) states.set(key, parseStoredState(state));
  } catch {
    localStorage.removeItem(storageKey);
  }
  if (states.size === 0) {
    const now = new Date();
    const reviewedAt = new Date(now.getTime() - 86_400_000 * 4);
    const known = schedule(initialState(reviewedAt), "good", reviewedAt).next;
    states.set(reviewKey(1, "kr"), { ...known, due: new Date(now.getTime() - 86_400_000 * 3) });
    states.set(reviewKey(1, "jp"), { ...known, due: new Date(now.getTime() + 86_400_000) });
  }
  return states;
}

export function loadDemoLogs(characterId: number, track: "kr" | "jp" | "cn"): ReviewLogEntry[] {
  try {
    const logs = JSON.parse(localStorage.getItem(logStorageKey) ?? "{}") as Record<string, StoredLog[]>;
    return (logs[reviewKey(characterId, track)] ?? []).map((log) => ({ ...log, answeredAt: new Date(log.answeredAt) }));
  } catch {
    return [];
  }
}

export function loadAllDemoLogs(): ReviewLogEntry[] {
  try {
    const logs = JSON.parse(localStorage.getItem(logStorageKey) ?? "{}") as Record<string, StoredLog[]>;
    return Object.values(logs).flat().map((log) => ({ ...log, answeredAt: new Date(log.answeredAt) }));
  } catch {
    return [];
  }
}
