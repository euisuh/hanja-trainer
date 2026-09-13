import { intervalHistory, isDue, type ReviewLogEntry, type ReviewState } from "../../../shared/fsrs";
import type { CharacterEntry, Track } from "../../../shared/types";

export type IntervalBar = { days: number; height: number };

export function buildIntervalValues(intervals: number[]): IntervalBar[] {
  const largest = Math.max(...intervals, 1);
  return intervals.map((days) => ({ days, height: Math.max(8, days / largest * 82) }));
}

export function buildIntervalBars(logs: ReviewLogEntry[]): IntervalBar[] {
  return buildIntervalValues(intervalHistory(logs));
}

export function variantsLabel(character: CharacterEntry, tracks: Track[]): string {
  const glyphs = tracks.flatMap((track) => {
    const glyph = character.tracks.find((entry) => entry.track === track)?.glyph;
    return glyph ? [{ track, glyph }] : [];
  });
  const diverges = new Set(glyphs.map(({ glyph }) => glyph)).size > 1;
  return glyphs.map(({ track, glyph }) => diverges ? `${glyph} (${track.toUpperCase()})` : glyph).join(" / ");
}

export function recordValues(state: ReviewState | undefined, now = new Date()) {
  if (!state) return null;
  const accuracy = state.totalCount === 0 ? 0 : Math.round(state.correctCount / state.totalCount * 100);
  const due = isDue(state, now) ? "지금" : `${Math.max(1, Math.ceil((state.due.getTime() - now.getTime()) / 86_400_000))}일 후`;
  return { accuracy: `${accuracy}%`, reps: `${state.reps}회`, due, difficulty: `${state.difficulty.toFixed(1)} / 10` };
}
