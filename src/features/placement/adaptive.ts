import type { PlacementAnswer } from "../../shared/api";
import { TRACKS, type CharacterEntry, type Track } from "../../shared/types";

export const PLACEMENT_ITEM_BUDGET = 15;

export type TrackEstimate = {
  track: Track;
  levelOrd: number;
  minLevelOrd: number;
  maxLevelOrd: number;
  correct: number;
  total: number;
  unchanged: number;
  stable: boolean;
  askedCharacterIds: number[];
};

export type PlacementState = {
  budget: number;
  total: number;
  enabledTracks: Track[];
  estimates: Record<Track, TrackEstimate>;
};

export type PlacementItem = {
  character: CharacterEntry;
  track: Track;
  levelOrd: number;
};

export type PlacementResult = {
  track: Track;
  levelOrd: number;
  correct: number;
  total: number;
  accuracy: number;
};

export type PlacementScore = { track: Track; levelOrd: number; knownCount: number; totalSeen: number; accuracy: number };

export function scorePlacementAnswers(answers: PlacementAnswer[]): PlacementScore[] {
  return TRACKS.flatMap((track) => {
    const seen = answers.filter((answer) => answer.track === track);
    if (seen.length === 0) return [];
    const floor = Math.min(...seen.map((answer) => answer.levelOrd));
    const ceiling = Math.max(...seen.map((answer) => answer.levelOrd));
    const knownCount = seen.filter((answer) => answer.correct).length;
    const accuracy = Math.round(knownCount / seen.length * 100);
    return [{ track, levelOrd: Math.round(floor + (ceiling - floor) * accuracy / 100), knownCount, totalSeen: seen.length, accuracy }];
  });
}

function boundsFor(characters: CharacterEntry[], track: Track) {
  const levels = characters.flatMap((character) => character.tracks
    .filter((entry) => entry.track === track)
    .map((entry) => entry.levelOrd));
  return { min: Math.min(...levels), max: Math.max(...levels) };
}

export function createPlacementState(
  characters: CharacterEntry[],
  enabledTracks: Track[],
  budget = PLACEMENT_ITEM_BUDGET,
): PlacementState {
  function estimate(track: Track): TrackEstimate {
    const bounds = boundsFor(characters, track);
    return {
      track,
      levelOrd: Number.isFinite(bounds.min) ? bounds.min : 1,
      minLevelOrd: Number.isFinite(bounds.min) ? bounds.min : 1,
      maxLevelOrd: Number.isFinite(bounds.max) ? bounds.max : 1,
      correct: 0,
      total: 0,
      unchanged: 0,
      stable: !enabledTracks.includes(track),
      askedCharacterIds: [],
    };
  }
  const estimates = { kr: estimate("kr"), jp: estimate("jp"), cn: estimate("cn") };
  return { budget: Math.max(1, budget), total: 0, enabledTracks: [...enabledTracks], estimates };
}

export function isPlacementComplete(state: PlacementState): boolean {
  return state.total >= state.budget || state.enabledTracks.every((track) => state.estimates[track].stable);
}

export function nextPlacementItem(state: PlacementState, characters: CharacterEntry[]): PlacementItem | null {
  if (isPlacementComplete(state)) return null;
  const activeTracks = state.enabledTracks.filter((track) => !state.estimates[track].stable);
  if (activeTracks.length === 0) return null;
  const track = activeTracks[state.total % activeTracks.length];
  const estimate = state.estimates[track];
  const candidates = characters.flatMap((character) => character.tracks
    .filter((entry) => entry.track === track)
    .map((entry) => ({ character, track, levelOrd: entry.levelOrd })));
  const unused = candidates.filter((candidate) => !estimate.askedCharacterIds.includes(candidate.character.id));
  return (unused.length > 0 ? unused : candidates)
    .sort((a, b) => Math.abs(a.levelOrd - estimate.levelOrd) - Math.abs(b.levelOrd - estimate.levelOrd) || a.character.id - b.character.id)[0] ?? null;
}

export function recordPlacementAnswer(state: PlacementState, item: PlacementItem, correct: boolean): PlacementState {
  if (isPlacementComplete(state)) return state;
  const current = state.estimates[item.track];
  const levelOrd = Math.max(current.minLevelOrd, Math.min(current.maxLevelOrd, current.levelOrd + (correct ? 1 : -1)));
  const unchanged = levelOrd === current.levelOrd ? current.unchanged + 1 : 0;
  const total = current.total + 1;
  const minimumItems = Math.ceil(state.budget / state.enabledTracks.length);
  const estimate = {
    ...current,
    levelOrd,
    correct: current.correct + Number(correct),
    total,
    unchanged,
    stable: total >= minimumItems && unchanged >= 2,
    askedCharacterIds: [...current.askedCharacterIds, item.character.id],
  };
  return {
    ...state,
    total: state.total + 1,
    estimates: { ...state.estimates, [item.track]: estimate },
  };
}

export function placementResults(state: PlacementState): PlacementResult[] {
  return state.enabledTracks.map((track) => {
    const estimate = state.estimates[track];
    return {
      track,
      levelOrd: estimate.levelOrd,
      correct: estimate.correct,
      total: estimate.total,
      accuracy: estimate.total === 0 ? 0 : Math.round(estimate.correct / estimate.total * 100),
    };
  });
}
