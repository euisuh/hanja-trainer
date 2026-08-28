import { MASTERY_STABILITY_DAYS } from "../path-map/homeModel";
import { reviewKey } from "../session/buildQueue";
import type { ReviewState } from "../../shared/fsrs";
import type { CharacterEntry, Track } from "../../shared/types";

type Level = { name: string; count: number };

export type LevelProgress = { known: number; total: number; pct: number; currentLevel: string; nextLevel?: string };

export const examLevels: Record<Track, Level[]> = {
  kr: [{ name: "8급", count: 50 }, { name: "7급", count: 100 }, { name: "6급", count: 150 }, { name: "5급", count: 200 }, { name: "4급", count: 250 }, { name: "3급", count: 250 }],
  jp: [{ name: "10級", count: 80 }, { name: "9級", count: 160 }, { name: "8級", count: 200 }, { name: "7級", count: 200 }],
  cn: [{ name: "HSK 1", count: 246 }, { name: "HSK 2", count: 220 }, { name: "HSK 3", count: 214 }, { name: "HSK 4", count: 220 }],
};

export function progressFromKnown(knownValue: number, levels: Level[]): LevelProgress {
  const total = levels.reduce((sum, level) => sum + level.count, 0);
  const known = Math.min(total, Math.max(0, knownValue));
  let boundary = 0;
  let currentLevel = "시작 전";
  let nextLevel = levels[0]?.name;
  for (let index = 0; index < levels.length; index += 1) {
    boundary += levels[index].count;
    if (known < boundary) break;
    currentLevel = levels[index].name;
    nextLevel = levels[index + 1]?.name;
  }
  return { known, total, pct: total === 0 ? 0 : known / total * 100, currentLevel, nextLevel };
}

export function levelProgress(track: Track, characters: CharacterEntry[], states: ReadonlyMap<string, ReviewState>): LevelProgress {
  const known = characters.filter((character) => character.tracks.some((entry) => entry.track === track)
    && (states.get(reviewKey(character.id, track))?.stability ?? 0) >= MASTERY_STABILITY_DAYS).length;
  return progressFromKnown(known, examLevels[track]);
}
