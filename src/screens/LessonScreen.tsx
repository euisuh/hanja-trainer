import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import sampleSeed from "../../data/characters.sample.json";
import cnSentences from "../../data/sentences/cn-hsk1.json";
import jpSentences from "../../data/sentences/jp-kanken-10.json";
import krSentences from "../../data/sentences/kr-8geup.json";
import { SessionRunner, type PersistedAnswer } from "../features/session/SessionRunner";
import { reviewKey } from "../features/session/buildQueue";
import { initialState, type ReviewState } from "../shared/fsrs";
import type { CharacterEntry, SeedCharacterEntry, TrackEntry } from "../shared/types";

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
const sentenceByPair = new Map(rawSentences.filter((sentence) => sentence.rank === 0).map((sentence) => [`${sentence.character_key}:${sentence.track}`, sentence]));

// ponytail: compact real-data demo; replace with #14's curriculum/session endpoint.
const lessonCharacters: CharacterEntry[] = (sampleSeed as SeedCharacterEntry[]).slice(0, 8).map((character, index) => {
  const id = index + 1;
  const tracks = character.tracks.map((entry) => {
    const track = { ...entry, characterId: id };
    delete track.sentences;
    return track as TrackEntry;
  });
  const sentences = tracks.flatMap((entry) => {
    const source = sentenceByPair.get(`${character.key}:${entry.track}`);
    return source ? [{
      id: id * 10 + sentencesOffset(entry.track),
      characterId: id,
      track: entry.track,
      text: source.text,
      translationKo: source.translation_ko,
      source: source.source,
      sourceKind: source.source_kind,
      targetIndex: source.target_index,
      rank: source.rank,
    }] : [];
  });
  return { id, key: character.key, meaningEn: character.meaningEn, meaningKo: character.meaningKo, variants: character.variants, strokeCount: character.strokeCount, createdAt: 0, tracks, sentences };
});

function sentencesOffset(track: "kr" | "jp" | "cn"): number {
  return track === "kr" ? 1 : track === "jp" ? 2 : 3;
}

type StoredState = Omit<ReviewState, "due" | "lastReview"> & { due: string; lastReview: string | null };
const storageKey = "hanja-trainer.review-states";
const enabledTracks = ["kr", "jp", "cn"] as const;

function parseStoredState(state: StoredState): ReviewState {
  return { ...state, due: new Date(state.due), lastReview: state.lastReview ? new Date(state.lastReview) : null };
}

function loadStates(): Map<string, ReviewState> {
  const states = new Map<string, ReviewState>();
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<string, StoredState>;
    for (const [key, state] of Object.entries(stored)) states.set(key, parseStoredState(state));
  } catch {
    localStorage.removeItem(storageKey);
  }
  if (states.size === 0) {
    const now = new Date();
    const known = { ...initialState(now), correctCount: 2, totalCount: 2 };
    states.set(reviewKey(1, "kr"), { ...known, due: new Date(now.getTime() - 1) });
    states.set(reviewKey(1, "jp"), { ...known, due: new Date(now.getTime() + 86_400_000) });
  }
  return states;
}

function persistAnswer(answer: PersistedAnswer) {
  const stored = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<string, StoredState>;
  stored[reviewKey(answer.characterId, answer.track)] = {
    ...answer.state,
    due: answer.state.due.toISOString(),
    lastReview: answer.state.lastReview?.toISOString() ?? null,
  };
  localStorage.setItem(storageKey, JSON.stringify(stored));
}

export function LessonScreen() {
  const navigate = useNavigate();
  const states = useMemo(() => loadStates(), []);
  return (
    <SessionRunner
      characters={lessonCharacters}
      enabledTracks={[...enabledTracks]}
      initialReviewStates={states}
      mode="lesson"
      onComplete={(result) => navigate("/session-complete", { state: result })}
      onPersist={persistAnswer}
      onQuit={() => navigate("/home")}
    />
  );
}
