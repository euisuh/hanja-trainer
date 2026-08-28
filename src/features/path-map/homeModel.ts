import type { ReviewState } from "../../shared/fsrs";
import type { CharacterEntry, Track } from "../../shared/types";
import { readingFor, reviewKey } from "../session/buildQueue";
import { MASTERY_STABILITY_DAYS } from "../../shared/mastery";

export { MASTERY_STABILITY_DAYS } from "../../shared/mastery";

export type PathNodeState = "done" | "current" | "locked";

export type PathNodeModel = {
  characterKey: string;
  glyph: string;
  label: string;
  state: PathNodeState;
};

export function buildPathNodes(characters: CharacterEntry[], track: Track, states: ReadonlyMap<string, ReviewState>): PathNodeModel[] {
  const entries = characters.flatMap((character) => {
    const entry = character.tracks.find((candidate) => candidate.track === track);
    return entry ? [{ character, entry, mastered: (states.get(reviewKey(character.id, track))?.stability ?? 0) >= MASTERY_STABILITY_DAYS }] : [];
  });
  const currentIndex = entries.findIndex((entry) => !entry.mastered);
  return entries.map(({ character, entry, mastered }, index) => {
    const state = mastered ? "done" : index === currentIndex ? "current" : "locked";
    return { characterKey: character.key, glyph: entry.glyph, label: state === "locked" ? "잠김" : readingFor(entry).label, state };
  });
}

export function progressPercent(value: number, total: number): number {
  return total <= 0 ? 0 : Math.min(100, Math.max(0, value / total * 100));
}
