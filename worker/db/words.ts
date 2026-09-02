import type { Track, WordEntry } from "../../src/shared/types";

type WordRow = {
  id: number;
  track: Track;
  glyph: string;
  reading: string;
  level: string;
  level_ord: number;
  source_url: string;
  character_id: number;
  key: string;
  position: number;
};

export async function listWordsForTracks(db: D1Database, tracks: Track[]): Promise<WordEntry[]> {
  if (tracks.length === 0) return [];
  const placeholders = tracks.map(() => "?").join(", ");
  const result = await db.prepare(`
    SELECT w.id, w.track, w.glyph, w.reading, w.level, w.level_ord, w.source_url,
      wm.character_id, c.key, wm.position
    FROM words w
    JOIN word_members wm ON wm.word_id = w.id
    JOIN characters c ON c.id = wm.character_id
    WHERE w.track IN (${placeholders})
    ORDER BY w.track, w.level_ord, w.id, wm.position
  `).bind(...tracks).all<WordRow>();
  const words = new Map<number, WordEntry>();
  for (const row of result.results) {
    const word = words.get(row.id) ?? {
      id: row.id,
      track: row.track,
      glyph: row.glyph,
      reading: row.reading,
      level: row.level,
      levelOrd: row.level_ord,
      sourceUrl: row.source_url,
      members: [],
    };
    word.members.push({ characterId: row.character_id, key: row.key, position: row.position });
    words.set(row.id, word);
  }
  return [...words.values()];
}
