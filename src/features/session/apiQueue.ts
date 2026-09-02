import type { SessionCard, SessionCompareEntry } from "../../shared/api";
import type { CharacterEntry, ExampleSentence, Track, TrackEntry, WordEntry } from "../../shared/types";
import type { SessionQueueItem } from "./buildQueue";

function trackEntry(track: Track, card: Pick<SessionCard, "glyph" | "kun" | "levelBadge" | "levelOrd" | "meaning" | "reading">, characterId: number): TrackEntry {
  if (track === "kr") return { characterId, track, glyph: card.glyph, reading: card.reading, level: card.levelBadge.replace(/^한자 /u, ""), levelOrd: card.levelOrd };
  if (track === "jp") {
    const [jlpt = "—", kanken = "未指定"] = card.levelBadge.split(" · 漢検 ");
    return { characterId, track, glyph: card.glyph, on: card.reading, kun: card.kun ?? "なし", kanken, jlpt, levelOrd: card.levelOrd };
  }
  const [hsk = "—", tier = "—"] = card.levelBadge.split(" · ");
  return { characterId, track, glyph: card.glyph, pinyin: card.reading, meaning: card.meaning, hsk, tier, levelOrd: card.levelOrd };
}

function compareTrack(track: Track, entry: SessionCompareEntry, characterId: number): TrackEntry {
  return trackEntry(track, { glyph: entry.glyph, levelBadge: entry.levelBadge, levelOrd: 1, meaning: "", reading: entry.reading }, characterId);
}

function characterFor(card: SessionCard, characterId: number): CharacterEntry {
  const tracks = card.kind === "compare"
    ? (Object.entries(card.compare ?? {}) as Array<[Track, SessionCompareEntry]>).map(([track, entry]) => compareTrack(track, entry, characterId))
    : [trackEntry(card.track, card, characterId)];
  const sentences: ExampleSentence[] = card.sentence ? [{
    id: characterId,
    characterId,
    track: card.track,
    text: card.sentence.text,
    reading: null,
    translationKo: card.sentence.translation,
    source: card.sentence.source,
    sourceKind: "corpus",
    targetIndex: card.sentence.targetIndex,
    rank: 0,
  }] : [];
  return { id: characterId, key: card.characterKey, meaningEn: card.meaning, meaningKo: card.meaningKo, variants: {}, strokeCount: null, createdAt: 0, tracks, sentences };
}

export function apiCardsToQueue(cards: SessionCard[]): SessionQueueItem[] {
  return cards.map((card, index) => {
    const character = characterFor(card, index + 1);
    if (card.kind === "compare") return { kind: "compare", character, track: card.track };
    if (card.kind === "word") {
      const word: WordEntry = {
        id: card.wordId ?? index + 1,
        track: "kr",
        glyph: card.glyph,
        reading: card.options[card.answerIndex]?.label ?? "—",
        level: card.levelBadge.replace(/^한자어 /u, ""),
        levelOrd: card.levelOrd,
        sourceUrl: card.wordSourceUrl ?? "",
        members: (card.memberKeys ?? [card.characterKey]).map((key, position) => ({ characterId: (index + 1) * 100 + position, key, position })),
      };
      return { kind: "word", word, character, track: "kr", options: card.options.map((option) => ({ label: option.label })), answerIndex: card.answerIndex };
    }
    return { kind: card.kind, character, track: card.track, options: card.options.map((option) => ({ label: option.label })), answerIndex: card.answerIndex };
  });
}

export function queueCharacters(queue: SessionQueueItem[]): CharacterEntry[] {
  return queue.map((item) => item.character);
}
