import { TRACKS, type CharacterEntry, type ExampleSentence, type Track, type TrackEntry } from "../../src/shared/types";

interface CharacterRow {
  id: number;
  key: string;
  meaning_en: string;
  meaning_ko: string;
  variants: string;
  stroke_count: number | null;
  created_at: number;
  track: Track;
  glyph: string;
  level_ord: number;
  kr_reading: string | null;
  kr_level: string | null;
  jp_on: string | null;
  jp_kun: string | null;
  jp_kanken: string | null;
  jp_jlpt: string | null;
  cn_pinyin: string | null;
  cn_meaning: string | null;
  cn_hsk: string | null;
  cn_tier: string | null;
  sentence_id: number | null;
  sentence_text: string | null;
  translation_ko: string | null;
  source: string | null;
  source_kind: ExampleSentence["sourceKind"] | null;
  target_index: number | null;
  sentence_rank: number | null;
}

interface DistractorRow {
  character_id: number;
  track: Track;
  glyph: string;
  level_ord: number;
  kr_reading: string | null;
  kr_level: string | null;
  jp_on: string | null;
  jp_kun: string | null;
  jp_kanken: string | null;
  jp_jlpt: string | null;
  cn_pinyin: string | null;
  cn_meaning: string | null;
  cn_hsk: string | null;
  cn_tier: string | null;
}

const SELECT_ENTRIES = `
  SELECT c.id, c.key, c.meaning_en, c.meaning_ko, c.variants, c.stroke_count, c.created_at,
    ct.track, ct.glyph, ct.level_ord, ct.kr_reading, ct.kr_level,
    ct.jp_on, ct.jp_kun, ct.jp_kanken, ct.jp_jlpt,
    ct.cn_pinyin, ct.cn_meaning, ct.cn_hsk, ct.cn_tier,
    es.id AS sentence_id, es.text AS sentence_text, es.translation_ko, es.source,
    es.source_kind, es.target_index, es.rank AS sentence_rank
  FROM characters c
  JOIN character_tracks ct ON ct.character_id = c.id
  LEFT JOIN example_sentences es ON es.character_id = c.id AND es.track = ct.track
`;

function required(value: string | null, field: string): string {
  if (value === null) throw new Error(`Database row missing ${field}`);
  return value;
}

function requiredNumber(value: number | null, field: string): number {
  if (value === null) throw new Error(`Database row missing ${field}`);
  return value;
}

function requiredSourceKind(value: CharacterRow["source_kind"]): ExampleSentence["sourceKind"] {
  if (value === null) throw new Error("Database row missing example_sentences.source_kind");
  return value;
}

function toTrack(row: DistractorRow): TrackEntry {
  const base = { characterId: row.character_id, glyph: row.glyph, levelOrd: row.level_ord };

  if (row.track === "kr") {
    return { ...base, track: "kr", reading: required(row.kr_reading, "kr_reading"), level: required(row.kr_level, "kr_level") };
  }
  if (row.track === "jp") {
    return {
      ...base,
      track: "jp",
      on: required(row.jp_on, "jp_on"),
      kun: required(row.jp_kun, "jp_kun"),
      kanken: required(row.jp_kanken, "jp_kanken"),
      jlpt: required(row.jp_jlpt, "jp_jlpt"),
    };
  }
  return {
    ...base,
    track: "cn",
    pinyin: required(row.cn_pinyin, "cn_pinyin"),
    meaning: required(row.cn_meaning, "cn_meaning"),
    hsk: required(row.cn_hsk, "cn_hsk"),
    tier: required(row.cn_tier, "cn_tier"),
  };
}

function parseVariants(json: string): Partial<Record<Track, string>> {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("Database row has invalid variants");

  const record = parsed as Record<string, unknown>;
  const variants: Partial<Record<Track, string>> = {};
  for (const track of TRACKS) {
    if (typeof record[track] === "string") variants[track] = record[track];
  }
  return variants;
}

function hydrate(rows: CharacterRow[]): CharacterEntry[] {
  const entries = new Map<number, CharacterEntry>();
  const seenTracks = new Map<number, Set<Track>>();
  const seenSentences = new Map<number, Set<number>>();

  for (const row of rows) {
    let entry = entries.get(row.id);
    if (!entry) {
      entry = {
        id: row.id,
        key: row.key,
        meaningEn: row.meaning_en,
        meaningKo: row.meaning_ko,
        variants: parseVariants(row.variants),
        strokeCount: row.stroke_count,
        createdAt: row.created_at,
        tracks: [],
        sentences: [],
      };
      entries.set(row.id, entry);
      seenTracks.set(row.id, new Set());
      seenSentences.set(row.id, new Set());
    }

    const tracks = seenTracks.get(row.id)!;
    if (!tracks.has(row.track)) {
      entry.tracks.push(toTrack({ ...row, character_id: row.id }));
      tracks.add(row.track);
    }

    const sentences = seenSentences.get(row.id)!;
    if (row.sentence_id !== null && !sentences.has(row.sentence_id)) {
      entry.sentences.push({
        id: row.sentence_id,
        characterId: row.id,
        track: row.track,
        text: required(row.sentence_text, "example_sentences.text"),
        translationKo: required(row.translation_ko, "example_sentences.translation_ko"),
        source: required(row.source, "example_sentences.source"),
        sourceKind: requiredSourceKind(row.source_kind),
        targetIndex: requiredNumber(row.target_index, "example_sentences.target_index"),
        rank: requiredNumber(row.sentence_rank, "example_sentences.rank"),
      });
      sentences.add(row.sentence_id);
    }
  }

  return [...entries.values()];
}

export async function getCharacter(db: D1Database, key: string): Promise<CharacterEntry | null> {
  const result = await db.prepare(`${SELECT_ENTRIES} WHERE c.key = ?1 ORDER BY CASE ct.track WHEN 'kr' THEN 1 WHEN 'jp' THEN 2 ELSE 3 END, es.rank`).bind(key).all<CharacterRow>();
  return hydrate(result.results)[0] ?? null;
}

export async function listByUnit(db: D1Database, unitId: number): Promise<CharacterEntry[]> {
  const result = await db.prepare(`${SELECT_ENTRIES}
    JOIN curriculum_unit_members cum ON cum.character_id = c.id
    WHERE cum.unit_id = ?1
    ORDER BY cum.ord, CASE ct.track WHEN 'kr' THEN 1 WHEN 'jp' THEN 2 ELSE 3 END, es.rank`).bind(unitId).all<CharacterRow>();
  return hydrate(result.results);
}

export async function listByTrackLevel(db: D1Database, track: Track, levelOrd: number): Promise<CharacterEntry[]> {
  const result = await db.prepare(`${SELECT_ENTRIES}
    WHERE EXISTS (
      SELECT 1 FROM character_tracks matched
      WHERE matched.character_id = c.id AND matched.track = ?1 AND matched.level_ord = ?2
    )
    ORDER BY c.key, CASE ct.track WHEN 'kr' THEN 1 WHEN 'jp' THEN 2 ELSE 3 END, es.rank`).bind(track, levelOrd).all<CharacterRow>();
  return hydrate(result.results);
}

export async function listForTracks(db: D1Database, tracks: Track[]): Promise<CharacterEntry[]> {
  if (tracks.length === 0) return [];
  const placeholders = tracks.map((_, index) => `?${index + 1}`).join(", ");
  const result = await db.prepare(`${SELECT_ENTRIES}
    WHERE EXISTS (
      SELECT 1 FROM character_tracks selected
      WHERE selected.character_id = c.id AND selected.track IN (${placeholders})
    )
    ORDER BY c.id, CASE ct.track WHEN 'kr' THEN 1 WHEN 'jp' THEN 2 ELSE 3 END, es.rank`).bind(...tracks).all<CharacterRow>();
  return hydrate(result.results);
}

export async function searchDistractors(
  db: D1Database,
  track: Track,
  levelOrd: number,
  excludeId: number,
  n: number,
): Promise<TrackEntry[]> {
  if (n <= 0) return [];

  const result = await db.prepare(`
    WITH ranked AS (
      SELECT ct.*,
        CASE ct.track WHEN 'kr' THEN ct.kr_reading WHEN 'jp' THEN ct.jp_on ELSE ct.cn_pinyin END AS reading,
        ROW_NUMBER() OVER (
          PARTITION BY CASE ct.track WHEN 'kr' THEN ct.kr_reading WHEN 'jp' THEN ct.jp_on ELSE ct.cn_pinyin END
          ORDER BY ABS(ct.level_ord - ?2), ct.character_id
        ) AS reading_rank
      FROM character_tracks ct
      WHERE ct.track = ?1 AND ct.character_id != ?3
    ), excluded AS (
      SELECT CASE track WHEN 'kr' THEN kr_reading WHEN 'jp' THEN jp_on ELSE cn_pinyin END AS reading
      FROM character_tracks WHERE character_id = ?3 AND track = ?1
    )
    SELECT ranked.character_id, ranked.track, ranked.glyph, ranked.level_ord,
      ranked.kr_reading, ranked.kr_level, ranked.jp_on, ranked.jp_kun,
      ranked.jp_kanken, ranked.jp_jlpt, ranked.cn_pinyin, ranked.cn_meaning,
      ranked.cn_hsk, ranked.cn_tier
    FROM ranked, excluded
    WHERE ranked.reading_rank = 1 AND ranked.reading != excluded.reading
    ORDER BY ABS(ranked.level_ord - ?2), ranked.character_id
    LIMIT ?4
  `).bind(track, levelOrd, excludeId, Math.floor(n)).all<DistractorRow>();

  return result.results.map(toTrack);
}
