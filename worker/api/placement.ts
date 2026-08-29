import { scorePlacementAnswers } from "../../src/features/placement/adaptive";
import type { PlacementAnswer, PlacementScoreResponse } from "../../src/shared/api";
import { TRACKS, type Track } from "../../src/shared/types";

type BadgeRow = { level_badge: string };

export function parsePlacementAnswers(value: unknown): PlacementAnswer[] | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const answers = (value as Record<string, unknown>).answers;
  if (!Array.isArray(answers) || answers.length < 1 || answers.length > 100) return null;
  const parsed: PlacementAnswer[] = [];
  for (const value of answers) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const answer = value as Record<string, unknown>;
    if (typeof answer.characterKey !== "string" || answer.characterKey.length < 1 || answer.characterKey.length > 16) return null;
    if (typeof answer.track !== "string" || !TRACKS.includes(answer.track as Track) || typeof answer.correct !== "boolean" || typeof answer.skipped !== "boolean" || answer.skipped && answer.correct) return null;
    if (!Number.isInteger(answer.levelOrd) || (answer.levelOrd as number) < 1 || (answer.levelOrd as number) > 1_000) return null;
    parsed.push(answer as PlacementAnswer);
  }
  return parsed;
}

function detail(track: Track, badge: string, known: number, total: number, accuracy: number): string {
  if (track === "kr") return `${known}/${total}문항 정확 · ${badge} 시작`;
  if (track === "jp") return `音読み 정확도 ${accuracy}% · ${badge} 수준`;
  return `拼音 정확도 ${accuracy}% · ${badge}`;
}

export async function scoreAndSavePlacement(db: D1Database, answers: PlacementAnswer[], now = new Date()): Promise<PlacementScoreResponse> {
  const scores = scorePlacementAnswers(answers);
  const badgeResults = await db.batch(scores.map((score) => db.prepare(`
    SELECT CASE track WHEN 'kr' THEN kr_level WHEN 'jp' THEN jp_kanken ELSE cn_hsk END AS level_badge
    FROM character_tracks WHERE track = ?1
    ORDER BY ABS(level_ord - ?2), level_ord LIMIT 1
  `).bind(score.track, score.levelOrd)));
  const results = scores.map((score, index) => {
    const badge = (badgeResults[index].results[0] as unknown as BadgeRow | undefined)?.level_badge ?? String(score.levelOrd);
    return { ...score, levelBadge: badge, detail: detail(score.track, badge, score.knownCount, score.totalSeen, score.accuracy) };
  });
  await db.batch([
    ...results.map((result) => db.prepare(`
      INSERT INTO placement_results (track, level_ord, level_badge, accuracy, detail, taken_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    `).bind(result.track, result.levelOrd, result.levelBadge, result.accuracy, result.detail, now.getTime())),
    db.prepare("UPDATE profile SET onboarded_at = ?1, updated_at = ?1 WHERE id = 1").bind(now.getTime()),
  ]);
  return { results };
}
