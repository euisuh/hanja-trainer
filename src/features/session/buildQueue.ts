import { isDue, type ReviewState } from "../../shared/fsrs";
import type { CharacterEntry, Track, TrackEntry } from "../../shared/types";

// Compare cards are ungraded interstitials. After each cadence block in lesson
// and review, prefer a character just answered; one known enabled track is enough
// to qualify when the character is available in at least two enabled tracks.
export const COMPARE_CADENCE = 4;

export type AnswerOption = {
  label: string;
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
  freshKeys?: ReadonlySet<string>;
  placementKeys?: ReadonlySet<string>;
  now?: Date;
  random?: () => number;
};

type QueuePair = {
  character: CharacterEntry;
  track: Track;
  levelOrd: number;
  state: ReviewState | undefined;
};

export function reviewKey(characterId: number, track: Track): string {
  return `${characterId}:${track}`;
}

export function readingFor(entry: TrackEntry): AnswerOption {
  if (entry.track === "kr") return { label: entry.reading };
  if (entry.track === "jp") return { label: entry.on };
  return { label: entry.pinyin };
}

function tonelessPinyin(value: string): string {
  return value.normalize("NFD").replace(/u\u0308/gu, "v").replace(/\p{Mn}/gu, "").toLowerCase();
}

function pinyinParts(value: string): { initial: string; final: string } {
  const base = tonelessPinyin(value);
  const vowel = base.search(/[aeiouv]/u);
  return vowel < 0 ? { initial: base, final: "" } : { initial: base.slice(0, vowel), final: base.slice(vowel) };
}

function pinyinRime(final: string): string {
  return final.replace(/ng$/u, "n").replace(/^v/u, "i");
}

function koreanSounds(value: string): string[] {
  return value.split("/").flatMap((part) => {
    const sound = part.trim().split(/\s+/u).at(-1) ?? "";
    return sound.replace(/[()]/gu, " ").split(/\s+/u).filter(Boolean);
  });
}

function hangulDistance(left: string, right: string): number {
  const a = left.codePointAt(0) ?? 0;
  const b = right.codePointAt(0) ?? 0;
  if (Array.from(left).length !== 1 || Array.from(right).length !== 1 || a < 0xac00 || a > 0xd7a3 || b < 0xac00 || b > 0xd7a3) return 3;
  const parts = (code: number) => [Math.floor((code - 0xac00) / 588), Math.floor((code - 0xac00) % 588 / 28), (code - 0xac00) % 28];
  const aa = parts(a);
  const bb = parts(b);
  return aa.filter((part, index) => part !== bb[index]).length;
}

function koreanTier(left: string, right: string): number {
  return Math.min(...koreanSounds(left).flatMap((a) => koreanSounds(right).map((b) => a === b ? 0 : hangulDistance(a, b))), 3);
}

const VOICING_GROUPS = ["カガ", "キギ", "クグ", "ケゲ", "コゴ", "サザ", "シジ", "スズ", "セゼ", "ソゾ", "タダ", "チヂ", "ツヅ", "テデ", "トド", "ハバパ", "ヒビピ", "フブプ", "ヘベペ", "ホボポ"];
const FINAL_MORA = "ツチクキ";

function oneChangedSegment(left: string, right: string, matches: (a: string, b: string) => boolean): boolean {
  const a = left.split("・");
  const b = right.split("・");
  if (a.length !== b.length) return false;
  const changed = a.flatMap((segment, index) => segment === b[index] ? [] : [[segment, b[index]] as const]);
  return changed.length === 1 && matches(...changed[0]);
}

function voicingSwap(left: string, right: string): boolean {
  return oneChangedSegment(left, right, (a, b) => {
    const aa = Array.from(a);
    const bb = Array.from(b);
    const changed = aa.flatMap((mora, index) => mora === bb[index] ? [] : [[mora, bb[index]] as const]);
    return aa.length === bb.length && changed.length === 1 && VOICING_GROUPS.some((group) => group.includes(changed[0][0]) && group.includes(changed[0][1]));
  });
}

function longVowelSwap(left: string, right: string): boolean {
  return oneChangedSegment(left, right, (a, b) => a === b.slice(0, -1) && /[ウイ]$/u.test(b) || b === a.slice(0, -1) && /[ウイ]$/u.test(a));
}

function finalMoraSwap(left: string, right: string): boolean {
  return oneChangedSegment(left, right, (a, b) => a.slice(0, -1) === b.slice(0, -1) && FINAL_MORA.includes(a.at(-1) ?? "") && FINAL_MORA.includes(b.at(-1) ?? ""));
}

function oneMoraSubstitution(left: string, right: string): boolean {
  return oneChangedSegment(left, right, (a, b) => {
    const aa = Array.from(a);
    const bb = Array.from(b);
    return aa.length === bb.length && aa.filter((mora, index) => mora !== bb[index]).length === 1;
  });
}

function phoneticTier(correct: TrackEntry, candidate: TrackEntry): number {
  if (correct.track === "kr" && candidate.track === "kr") return koreanTier(correct.reading, candidate.reading);
  if (correct.track === "cn" && candidate.track === "cn") {
    const base = tonelessPinyin(correct.pinyin);
    const other = tonelessPinyin(candidate.pinyin);
    if (base === other) return 0;
    const a = pinyinParts(correct.pinyin);
    const b = pinyinParts(candidate.pinyin);
    if (a.final === b.final || a.initial === b.initial && pinyinRime(a.final) === pinyinRime(b.final)) return 1;
    return 2;
  }
  if (correct.track === "jp" && candidate.track === "jp") {
    if (voicingSwap(correct.on, candidate.on)) return 0;
    if (longVowelSwap(correct.on, candidate.on)) return 1;
    if (finalMoraSwap(correct.on, candidate.on)) return 2;
    if (oneMoraSubstitution(correct.on, candidate.on)) return 3;
    if (correct.kanken === candidate.kanken) return 4;
    return 5;
  }
  return 0;
}

function sampleDistractors(correctEntry: TrackEntry, entries: TrackEntry[], random: () => number, excluded = new Set<string>()): AnswerOption[] {
  const seen = new Set([readingFor(correctEntry).label]);
  const allCandidates = entries
    .map((entry) => ({ entry, option: readingFor(entry) }))
    .filter(({ option }) => {
      if (seen.has(option.label)) return false;
      seen.add(option.label);
      return true;
    });
  const alternatives = allCandidates.filter(({ option }) => !excluded.has(option.label));
  const candidates = alternatives.length >= 3 ? alternatives : allCandidates;

  const separator = correctEntry.track === "kr" ? "/" : "・";
  const segmentCount = readingFor(correctEntry).label.split(separator).length;
  const ranked = candidates
    .map((candidate) => ({
      ...candidate,
      tier: phoneticTier(correctEntry, candidate.entry),
      shape: candidate.option.label.split(separator).length === segmentCount ? 0 : 1,
    }))
    .sort((a, b) => a.tier - b.tier || a.shape - b.shape || Math.abs(a.entry.levelOrd - correctEntry.levelOrd) - Math.abs(b.entry.levelOrd - correctEntry.levelOrd) || a.entry.characterId - b.entry.characterId);
  if (alternatives.length > 0 && alternatives.length < 3) {
    const picked = [...ranked.filter(({ option }) => !excluded.has(option.label)), ...ranked.filter(({ option }) => excluded.has(option.label))].slice(0, 3);
    if (correctEntry.track === "jp" && !picked.some((candidate) => candidate.shape === 0)) {
      const sameShape = ranked.find((candidate) => candidate.shape === 0);
      if (sameShape) picked[picked.length - 1] = sameShape;
    }
    return picked.map(({ option }) => option);
  }
  if (correctEntry.track === "kr") return ranked.slice(0, 3).map(({ option }) => option);
  if (ranked.length < 3) return ranked.map(({ option }) => option);

  const bestTier = ranked[0].tier;
  const best = ranked.filter((candidate) => candidate.tier === bestTier);
  const first = best[Math.floor(random() * best.length)];
  const pool = ranked.filter((candidate) => candidate !== first).slice(0, 8);
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  const picked = [first, ...pool.slice(0, 2)];
  if (correctEntry.track === "jp" && !picked.some((candidate) => candidate.shape === 0)) {
    const sameShape = ranked.find((candidate) => candidate.shape === 0 && !picked.includes(candidate));
    if (sameShape) picked[2] = sameShape;
  }
  return picked.map(({ option }) => option);
}

function optionsFor(character: CharacterEntry, track: Track, characters: CharacterEntry[], offset: number, random: () => number, excluded?: Set<string>): { options: AnswerOption[]; answerIndex: number } | undefined {
  const correctEntry = character.tracks.find((entry) => entry.track === track);
  if (!correctEntry) throw new Error(`Character ${character.key} has no ${track} track`);
  const correct = readingFor(correctEntry);
  const distractors = sampleDistractors(correctEntry, characters
    .filter((candidate) => candidate.id !== character.id)
    .flatMap((candidate) => candidate.tracks.filter((entry) => entry.track === track)), random, excluded);
  if (distractors.length < 3) return undefined;
  const options = [correct, ...distractors];
  const shift = offset % options.length;
  const rotated = [...options.slice(shift), ...options.slice(0, shift)];
  return { options: rotated, answerIndex: rotated.findIndex((option) => option.label === correct.label) };
}

export function buildReadingItem(character: CharacterEntry, track: Track, characters: CharacterEntry[], offset: number, random: () => number = () => 0.5): ReadingQueueItem | undefined {
  const answer = optionsFor(character, track, characters, offset, random);
  return answer ? { kind: "reading", character, track, ...answer } : undefined;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}

export function buildUnitTestQueue({
  targets,
  characters,
  track,
  random = () => 0.5,
}: {
  targets: CharacterEntry[];
  characters: CharacterEntry[];
  track: Track;
  random?: () => number;
}): ReadingQueueItem[] {
  if (targets.length < 2) return [];
  const firstTargets = shuffle(targets, random);
  const first = firstTargets.map((character, index) => {
    const answer = optionsFor(character, track, characters, character.id + index, random);
    return answer ? { kind: "reading" as const, character, track, ...answer } : undefined;
  });
  if (first.some((item) => item === undefined)) return [];

  const firstById = new Map(first.map((item) => [item!.character.id, item!]));
  const secondTargets = shuffle(targets, random);
  if (secondTargets[0].id === firstTargets.at(-1)?.id) [secondTargets[0], secondTargets[1]] = [secondTargets[1], secondTargets[0]];
  const second = secondTargets.map((character, index) => {
    const previous = firstById.get(character.id)!;
    const excluded = new Set(previous.options.filter((_, optionIndex) => optionIndex !== previous.answerIndex).map((option) => option.label));
    const answer = optionsFor(character, track, characters, character.id + targets.length + index, random, excluded);
    if (!answer) return undefined;
    if (answer.answerIndex === previous.answerIndex) {
      answer.options.push(answer.options.shift()!);
      answer.answerIndex = (answer.answerIndex + answer.options.length - 1) % answer.options.length;
    }
    return { kind: "reading" as const, character, track, ...answer };
  });
  return second.some((item) => item === undefined) ? [] : [...first, ...second] as ReadingQueueItem[];
}

function placementPairs(pairs: QueuePair[], enabledTracks: Track[], length: number): QueuePair[] {
  const candidates = new Map(enabledTracks.map((track) => [track, pairs
    .filter((pair) => pair.track === track)
    .sort((a, b) => a.levelOrd - b.levelOrd || a.character.id - b.character.id)]));
  return Array.from({ length }, (_, index) => {
    const trackIndex = index % enabledTracks.length;
    const track = enabledTracks[trackIndex];
    const available = candidates.get(track) ?? [];
    const slots = Math.ceil((length - trackIndex) / enabledTracks.length);
    const slot = Math.floor(index / enabledTracks.length);
    return available[slots === 1 ? 0 : Math.round(slot * (available.length - 1) / (slots - 1))];
  }).filter((pair): pair is QueuePair => pair !== undefined);
}

export function buildQueue({
  characters,
  enabledTracks,
  length,
  mode,
  reviewStates = new Map(),
  freshKeys,
  placementKeys,
  now = new Date(),
  random = () => 0.5,
}: BuildQueueOptions): SessionQueueItem[] {
  if (length <= 0 || enabledTracks.length === 0) return [];
  const enabled = new Set(enabledTracks);
  const pairs = characters.flatMap((character) => character.tracks
    .filter((entry) => enabled.has(entry.track))
    .map((entry) => ({ character, track: entry.track, levelOrd: entry.levelOrd, state: reviewStates.get(reviewKey(character.id, entry.track)) })));
  const due = pairs
    .filter((pair) => pair.state && isDue(pair.state, now))
    .sort((a, b) => a.state!.due.getTime() - b.state!.due.getTime());
  const fresh = pairs.filter((pair) => !pair.state && (!freshKeys || freshKeys.has(reviewKey(pair.character.id, pair.track))));
  const placement = placementKeys ? pairs.filter((pair) => placementKeys.has(reviewKey(pair.character.id, pair.track))) : pairs;
  const available = mode === "review" ? due : mode === "lesson" ? [...due, ...fresh] : placementPairs(placement, enabledTracks, length);
  if (available.length === 0) return [];

  const compareCharacters = characters
    .filter((character) => {
      const enabledEntries = character.tracks.filter((entry) => enabled.has(entry.track));
      return enabledEntries.length >= 2 && enabledEntries.some((entry) => (reviewStates.get(reviewKey(character.id, entry.track))?.correctCount ?? 0) > 0);
    })
    .sort((a, b) => Math.max(...b.tracks.map((entry) => reviewStates.get(reviewKey(b.id, entry.track))?.lastReview?.getTime() ?? 0)) - Math.max(...a.tracks.map((entry) => reviewStates.get(reviewKey(a.id, entry.track))?.lastReview?.getTime() ?? 0)));
  const compareIds = new Set(compareCharacters.map((character) => character.id));

  const readings: ReadingQueueItem[] = [];
  const considered = new Set<string>();
  let dueIndex = 0;
  let freshIndex = 0;
  let fallbackIndex = 0;
  let readingIndex = 0;
  while (readings.length < length) {
    const preferred = mode === "lesson"
      ? (readingIndex % 2 === 0 ? fresh[freshIndex++] : due[dueIndex++])
      : undefined;
    readingIndex += 1;
    let pair = preferred;
    if (pair && considered.has(reviewKey(pair.character.id, pair.track))) pair = undefined;
    while (!pair && fallbackIndex < available.length) {
      const candidate = available[fallbackIndex++];
      if (!considered.has(reviewKey(candidate.character.id, candidate.track))) pair = candidate;
    }
    if (!pair) break;
    const key = reviewKey(pair.character.id, pair.track);
    considered.add(key);
    const item = buildReadingItem(pair.character, pair.track, characters, readings.length + pair.character.id, random);
    if (!item) continue;
    readings.push(item);
  }
  if (mode === "placement" || compareCharacters.length === 0) return readings;

  const queue: SessionQueueItem[] = [];
  const compared = new Set<number>();
  for (let index = 0; index < readings.length; index += 1) {
    queue.push(readings[index]);
    if ((index + 1) % COMPARE_CADENCE !== 0) continue;
    const recent = readings.slice(index + 1 - COMPARE_CADENCE, index + 1)
      .filter((item, itemIndex, items) => compareIds.has(item.character.id) && !compared.has(item.character.id) && items.findIndex((candidate) => candidate.character.id === item.character.id) === itemIndex);
    const candidates = recent.length > 0 ? recent : mode === "lesson" ? compareCharacters
      .filter((character) => !compared.has(character.id))
      .slice(0, COMPARE_CADENCE)
      .map((character) => ({ character, track: character.tracks.find((entry) => enabled.has(entry.track))!.track })) : [];
    if (candidates.length === 0) continue;
    const candidate = candidates[Math.floor(random() * candidates.length)];
    compared.add(candidate.character.id);
    queue.push({
      kind: "compare",
      character: { ...candidate.character, tracks: candidate.character.tracks.filter((entry) => enabled.has(entry.track)) },
      track: candidate.track,
    });
  }
  return queue;
}
