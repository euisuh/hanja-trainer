type Level = { name: string; count: number };

export type LevelProgress = { known: number; total: number; pct: number; currentLevel: string; nextLevel?: string };

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
