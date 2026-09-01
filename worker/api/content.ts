import { MASTERY_STABILITY_DAYS } from "../../src/shared/mastery";
import type { ApiSentence, ApiTrackDetail, CharacterDetailResponse, CurriculumResponse, UnitStudyResponse, UnitStudyTrackDetail } from "../../src/shared/api";
import type { CharacterEntry, Track, TrackEntry } from "../../src/shared/types";
import { getCharacter, getUnitDetail } from "../db/characters";
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
  level_ord: number;
  completion_character_id: number | null;
}

type PlacementRow = { level_ord: number };

function rowReading(row: CurriculumRow, track: Track): string {
  const reading = track === "kr" ? row.kr_reading : track === "jp" ? row.jp_on : row.cn_pinyin;
  if (!reading) throw new Error(`Curriculum ${row.key} is missing its ${track} reading`);
  return reading;
}

export async function getCurriculumContent(db: D1Database, track: Track): Promise<CurriculumResponse> {
  const [result, placementResult] = await db.batch([db.prepare(`
    SELECT cu.id AS unit_id, cu.level, cu.ord AS unit_ord, cu.title, cu.subtitle,
      cum.ord AS member_ord, c.key, ct.glyph, ct.kr_reading, ct.jp_on, ct.cn_pinyin,
      rs.stability, ct.level_ord, ucc.character_id AS completion_character_id
    FROM curriculum_units cu
    JOIN curriculum_unit_members cum ON cum.unit_id = cu.id
    JOIN characters c ON c.id = cum.character_id
    JOIN character_tracks ct ON ct.character_id = c.id AND ct.track = cu.track
    LEFT JOIN review_states rs ON rs.character_id = c.id AND rs.track = cu.track
    LEFT JOIN curriculum_unit_completion_members ucc ON ucc.unit_id = cu.id AND ucc.character_id = c.id
    WHERE cu.track = ?1
    ORDER BY MIN(ct.level_ord) OVER (PARTITION BY cu.id), cu.ord, cum.ord
  `).bind(track), db.prepare("SELECT level_ord FROM placement_results WHERE track = ?1 ORDER BY taken_at DESC, id DESC LIMIT 1").bind(track)]);
  const units = new Map<number, CurriculumResponse["units"][number]>();
  const unitLevels = new Map<number, number>();
  const completedMembers = new Map<number, number>();
  for (const row of result.results as unknown as CurriculumRow[]) {
    let unit = units.get(row.unit_id);
    if (!unit) {
      unit = { id: row.unit_id, level: row.level, ord: row.unit_ord, title: row.title, subtitle: row.subtitle, progress: { known: 0, total: 0 }, nodes: [], current: false };
      units.set(row.unit_id, unit);
    }
    unitLevels.set(row.unit_id, Math.min(unitLevels.get(row.unit_id) ?? row.level_ord, row.level_ord));
    if (row.completion_character_id !== null) completedMembers.set(row.unit_id, (completedMembers.get(row.unit_id) ?? 0) + 1);
    const mastered = (row.stability ?? 0) >= MASTERY_STABILITY_DAYS;
    if (mastered) unit.progress.known += 1;
    unit.progress.total += 1;
    unit.nodes.push({ key: row.key, glyph: row.glyph, reading: rowReading(row, track), state: mastered ? "done" : "locked" });
  }
  const ordered = [...units.values()];
  for (const unit of ordered) {
    if ((completedMembers.get(unit.id) ?? 0) === unit.nodes.length) {
      for (const node of unit.nodes) node.state = "done";
    }
  }
  const placementLevel = Number((placementResult.results[0] as unknown as PlacementRow | undefined)?.level_ord ?? 1);
  const matchedIndex = ordered.findIndex((unit) => (unitLevels.get(unit.id) ?? 1) >= placementLevel);
  const startIndex = matchedIndex < 0 ? Math.max(0, ordered.length - 1) : matchedIndex;
  const active = ordered.slice(startIndex).find((unit) => unit.nodes.some((node) => node.state !== "done")) ?? ordered.at(-1);
  if (active) {
    active.current = true;
    const node = active.nodes.find((candidate) => candidate.state !== "done");
    if (node) node.state = "current";
  }
  return { units: ordered };
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
        reading: sentence.reading,
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

function sentences(character: CharacterEntry, track: Track): ApiSentence[] {
  return character.sentences.filter((sentence) => sentence.track === track).map((sentence) => ({
    text: sentence.text,
    reading: sentence.reading,
    translation: sentence.translationKo,
    source: sentence.source,
    target_index: sentence.targetIndex,
  }));
}

function studyTrack(character: CharacterEntry, entry: TrackEntry): UnitStudyTrackDetail {
  const base = { track: entry.track, glyph: entry.glyph, sentences: sentences(character, entry.track) };
  if (entry.track === "kr") return { ...base, track: "kr", reading: entry.reading, meaning: character.meaningKo, level_badges: [`한자 ${entry.level}`] };
  if (entry.track === "jp") return { ...base, track: "jp", reading: entry.on, subreading: entry.kun, meaning: character.meaningEn, level_badges: [`漢検 ${entry.kanken}`, entry.jlpt] };
  return { ...base, track: "cn", reading: entry.pinyin, meaning: entry.meaning, level_badges: [entry.hsk, entry.tier] };
}

export async function getUnitStudyContent(db: D1Database, unitId: number): Promise<UnitStudyResponse | null> {
  const detail = await getUnitDetail(db, unitId);
  if (!detail) return null;
  return {
    unit: { id: detail.id, track: detail.track, level: detail.level, ord: detail.ord, title: detail.title, subtitle: detail.subtitle },
    characters: detail.characters.map((character) => ({
      key: character.key,
      meaning_en: character.meaningEn,
      meaning_ko: character.meaningKo,
      tracks: character.tracks.map((entry) => studyTrack(character, entry)),
    })),
  };
}
