import { isDue, type ReviewState } from "../../shared/fsrs";
import { toHiragana } from "../../shared/kana";
import type { OnyomiScript } from "../../shared/settings";
import type { CharacterEntry, Track, TrackEntry } from "../../shared/types";

export const COMPARE_CADENCE = 4;

export type AnswerOption = {
  label: string;
  sublabel: string;
};

export type ReadingQueueItem = {
  kind: "reading";
  character: CharacterEntry;
  track: Track;
  options: AnswerOption[];
  answerIndex: number;
};

export type CompareQueueItem = {
  kind: "compare";
  character: CharacterEntry;
  track: Track;
};

export type SessionQueueItem = ReadingQueueItem | CompareQueueItem;

export type BuildQueueOptions = {
  characters: CharacterEntry[];
  enabledTracks: Track[];
  length: number;
  mode: "lesson" | "review" | "placement";
  reviewStates?: ReadonlyMap<string, ReviewState>;
  now?: Date;
};

export function reviewKey(characterId: number, track: Track): string {
  return `${characterId}:${track}`;
}

export function readingFor(entry: TrackEntry, onyomiScript: OnyomiScript = "katakana"): AnswerOption {
  if (entry.track === "kr") return { label: entry.reading, sublabel: "훈 + 음" };
  if (entry.track === "jp") return { label: onyomiScript === "hiragana" ? toHiragana(entry.on) : entry.on, sublabel: `訓 ${entry.kun}` };
  return { label: entry.pinyin, sublabel: entry.meaning };
}

function optionsFor(character: CharacterEntry, track: Track, characters: CharacterEntry[], offset: number): { options: AnswerOption[]; answerIndex: number } {
  const correctEntry = character.tracks.find((entry) => entry.track === track);
  if (!correctEntry) throw new Error(`Character ${character.key} has no ${track} track`);
  const correct = readingFor(correctEntry);
  const seen = new Set([correct.label]);
  const distractors = characters
    .filter((candidate) => candidate.id !== character.id)
    .flatMap((candidate) => candidate.tracks.filter((entry) => entry.track === track))
    .sort((a, b) => Math.abs(a.levelOrd - correctEntry.levelOrd) - Math.abs(b.levelOrd - correctEntry.levelOrd) || a.characterId - b.characterId)
    .map((entry) => readingFor(entry))
    .filter((option) => {
      if (seen.has(option.label)) return false;
      seen.add(option.label);
      return true;
    })
    .slice(0, 3);
  if (distractors.length < 3) throw new Error(`Not enough unique ${track} distractors for ${character.key}`);
  const options = [correct, ...distractors];
  const shift = offset % options.length;
  const rotated = [...options.slice(shift), ...options.slice(0, shift)];
  return { options: rotated, answerIndex: rotated.findIndex((option) => option.label === correct.label) };
}

export function buildReadingItem(character: CharacterEntry, track: Track, characters: CharacterEntry[], offset: number): ReadingQueueItem {
  return { kind: "reading", character, track, ...optionsFor(character, track, characters, offset) };
}

export function buildQueue({
  characters,
  enabledTracks,
  length,
  mode,
  reviewStates = new Map(),
  now = new Date(),
}: BuildQueueOptions): SessionQueueItem[] {
  if (length <= 0 || enabledTracks.length === 0) return [];
  const enabled = new Set(enabledTracks);
  const pairs = characters.flatMap((character) => character.tracks
    .filter((entry) => enabled.has(entry.track))
    .map((entry) => ({ character, track: entry.track, state: reviewStates.get(reviewKey(character.id, entry.track)) })));
  const due = pairs
    .filter((pair) => pair.state && isDue(pair.state, now))
    .sort((a, b) => a.state!.due.getTime() - b.state!.due.getTime());
  const fresh = pairs.filter((pair) => !pair.state);
  const available = mode === "review" ? due : pairs;
  if (available.length === 0) return [];

  const knownTracks = new Map<number, Set<Track>>();
  for (const character of characters) {
    const known = new Set(character.tracks
      .filter((entry) => (reviewStates.get(reviewKey(character.id, entry.track))?.correctCount ?? 0) > 0)
      .map((entry) => entry.track));
    if (known.size >= 2) knownTracks.set(character.id, known);
  }
  const compareCharacters = characters.filter((character) => knownTracks.has(character.id));

  const queue: SessionQueueItem[] = [];
  const queueLength = mode === "review" ? Math.min(length, available.length) : length;
  let dueIndex = 0;
  let freshIndex = 0;
  let fallbackIndex = 0;
  let readingIndex = 0;
  for (let index = 0; index < queueLength; index += 1) {
    if (mode === "lesson" && (index + 1) % COMPARE_CADENCE === 0 && compareCharacters.length > 0) {
      const character = compareCharacters[Math.floor(index / COMPARE_CADENCE) % compareCharacters.length];
      const track = character.tracks.find((entry) => enabled.has(entry.track))?.track ?? character.tracks[0].track;
      queue.push({ kind: "compare", character, track });
      continue;
    }
    const preferred = mode === "lesson"
      ? (readingIndex % 2 === 0 ? fresh[freshIndex++] : due[dueIndex++])
      : undefined;
    const pair = preferred ?? available[fallbackIndex++ % available.length];
    queue.push(buildReadingItem(pair.character, pair.track, characters, index + pair.character.id));
    readingIndex += 1;
  }
  return queue;
}
