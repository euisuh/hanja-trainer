import type { ReviewState } from "../../../shared/fsrs";
import type { CurriculumUnitPayload } from "../../../shared/api";
import { TRACKS, type CharacterEntry, type Track } from "../../../shared/types";
import { readingFor, reviewKey } from "../../../shared/buildQueue";
import { MASTERY_STABILITY_DAYS } from "../../../shared/mastery";

export { MASTERY_STABILITY_DAYS } from "../../../shared/mastery";

export type PathNodeState = "done" | "current" | "locked";

export type PathNodeModel = {
  characterKey: string;
  glyph: string;
  label: string;
  state: PathNodeState;
};

export type TrackSnoozes = Partial<Record<Track, number>>;

export function homePrimaryAction(dueCount: number, unitId: number, track: Track) {
  return dueCount > 0
    ? { path: "/review/session", state: { track } }
    : { path: "/lesson", state: { unitId, tracks: [track] } };
}

export function reviewableUnits(units: CurriculumUnitPayload[]): CurriculumUnitPayload[] {
  const current = units.findIndex((unit) => unit.current);
  return units.filter((unit, index) => index < current || unit.nodes.every((node) => node.state === "done"));
}

export function reviewableLevels(units: CurriculumUnitPayload[]): Pick<CurriculumUnitPayload, "level" | "levelOrd">[] {
  const unitIds = new Set(reviewableUnits(units).map((unit) => unit.id));
  return [...new Map(units.map((unit) => [unit.levelOrd, { level: unit.level, levelOrd: unit.levelOrd }])).values()]
    .filter(({ levelOrd }) => units.every((unit) => unit.levelOrd !== levelOrd || unitIds.has(unit.id)))
    .sort((left, right) => left.levelOrd - right.levelOrd);
}

export function reviewLevelOptions(units: CurriculumUnitPayload[]): { label: string; levelOrd: number }[] {
  const levels = [...new Map(units.map((unit) => [unit.levelOrd, unit.level])).entries()].sort(([left], [right]) => left - right);
  const remaining = new Map<string, number>();
  for (const [, level] of levels) remaining.set(level, (remaining.get(level) ?? 0) + 1);
  return levels.map(([levelOrd, level]) => {
    const count = remaining.get(level)!;
    remaining.set(level, count - 1);
    return { label: count > 1 ? `${level}${"I".repeat(count)}` : level, levelOrd };
  });
}

const MIN_LEADER_MASTERY = 20;
const LAGGING_RATIO = 0.5;

export function trackImbalance(tracks: readonly { track: Track; known: number }[], snoozes: TrackSnoozes, now: number): Track | undefined {
  const enabled = TRACKS.flatMap((track) => {
    const progress = tracks.find((candidate) => candidate.track === track);
    return progress ? [progress] : [];
  });
  if (enabled.length < 2) return undefined;
  const leader = enabled.reduce((best, candidate) => candidate.known > best.known ? candidate : best);
  if (leader.known < MIN_LEADER_MASTERY) return undefined;
  const lagging = enabled
    .filter((candidate) => candidate.track !== leader.track && candidate.known <= leader.known * LAGGING_RATIO)
    .reduce<(typeof enabled)[number] | undefined>((lowest, candidate) => !lowest || candidate.known < lowest.known ? candidate : lowest, undefined);
  return lagging && (snoozes[lagging.track] ?? 0) <= now ? lagging.track : undefined;
}

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
