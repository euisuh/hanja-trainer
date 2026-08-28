import { MASTERY_STABILITY_DAYS } from "../../src/shared/mastery";
import type { ApiTrackDetail, CharacterDetailResponse, CurriculumResponse } from "../../src/shared/api";
import type { Track } from "../../src/shared/types";
import { getCharacter } from "../db/characters";
import { getStatsForCharacter } from "../db/reviews";

interface CurriculumRow {
  unit_id: number;
  level: string;
  unit_ord: number;
  title: string;
  subtitle: string;
  member_ord: number;
  key: string;
  glyph: string;
  kr_reading: string | null;
  jp_on: string | null;
  cn_pinyin: string | null;
  stability: number | null;
}

function rowReading(row: CurriculumRow, track: Track): string {
  const reading = track === "kr" ? row.kr_reading : track === "jp" ? row.jp_on : row.cn_pinyin;
  if (!reading) throw new Error(`Curriculum ${row.key} is missing its ${track} reading`);
  return reading;
}

export async function getCurriculumContent(db: D1Database, track: Track): Promise<CurriculumResponse> {
  const result = await db.prepare(`
    SELECT cu.id AS unit_id, cu.level, cu.ord AS unit_ord, cu.title, cu.subtitle,
      cum.ord AS member_ord, c.key, ct.glyph, ct.kr_reading, ct.jp_on, ct.cn_pinyin,
      rs.stability
    FROM curriculum_units cu
    JOIN curriculum_unit_members cum ON cum.unit_id = cu.id
    JOIN characters c ON c.id = cum.character_id
    JOIN character_tracks ct ON ct.character_id = c.id AND ct.track = cu.track
    LEFT JOIN review_states rs ON rs.character_id = c.id AND rs.track = cu.track
    WHERE cu.track = ?1
    ORDER BY cu.ord, cum.ord
  `).bind(track).all<CurriculumRow>();
  const units = new Map<number, CurriculumResponse["units"][number]>();
  for (const row of result.results) {
    let unit = units.get(row.unit_id);
    if (!unit) {
      unit = { id: row.unit_id, level: row.level, ord: row.unit_ord, title: row.title, subtitle: row.subtitle, progress: { known: 0, total: 0 }, nodes: [] };
      units.set(row.unit_id, unit);
    }
    const mastered = (row.stability ?? 0) >= MASTERY_STABILITY_DAYS;
    if (mastered) unit.progress.known += 1;
    unit.progress.total += 1;
    unit.nodes.push({ key: row.key, glyph: row.glyph, reading: rowReading(row, track), state: mastered ? "done" : "locked" });
  }
  for (const unit of units.values()) {
    const current = unit.nodes.find((node) => node.state !== "done");
    if (current) current.state = "current";
  }
  return { units: [...units.values()] };
}

export async function getCharacterContent(db: D1Database, key: string): Promise<CharacterDetailResponse | null> {
  const character = await getCharacter(db, key);
  if (!character) return null;
  const stats = await getStatsForCharacter(db, character.id);
  const tracks: ApiTrackDetail[] = character.tracks.map((entry) => {
    const state = stats.states.find((candidate) => candidate.track === entry.track);
    const base = {
      track: entry.track,
      glyph: entry.glyph,
      sentences: character.sentences.filter((sentence) => sentence.track === entry.track).map((sentence) => ({
        text: sentence.text,
        translation: sentence.translationKo,
        source: sentence.source,
        target_index: sentence.targetIndex,
      })),
      review_state: state ? {
        stability: state.stability,
        difficulty: state.difficulty,
        reps: state.reps,
        lapses: state.lapses,
        due: state.due.toISOString(),
        correct_count: state.correctCount,
        total_count: state.totalCount,
        interval_history: stats.intervalHistory.get(entry.track) ?? [],
      } : null,
    };
    if (entry.track === "kr") return { ...base, track: "kr", reading: entry.reading, level_badges: [`한자 ${entry.level}`] };
    if (entry.track === "jp") return { ...base, track: "jp", reading: `音 ${entry.on}`, subreading: `訓 ${entry.kun}`, level_badges: [`漢検 ${entry.kanken}`, entry.jlpt] };
    return { ...base, track: "cn", reading: entry.pinyin, level_badges: [entry.hsk, entry.tier] };
  });
  return { key: character.key, variants: character.variants, meaning_en: character.meaningEn, meaning_ko: character.meaningKo, tracks };
}
