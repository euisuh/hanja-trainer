import type { SessionCard, SessionCompareEntry } from "../../shared/api";
import type { CharacterEntry, ExampleSentence, Track, TrackEntry } from "../../shared/types";
import type { SessionQueueItem } from "./buildQueue";

function trackEntry(track: Track, card: Pick<SessionCard, "glyph" | "levelBadge">, reading: string, sub: string, characterId: number): TrackEntry {
  if (track === "kr") return { characterId, track, glyph: card.glyph, reading, level: card.levelBadge.replace(/^한자 /u, ""), levelOrd: 1 };
  if (track === "jp") {
    const [kanken = "—", jlpt = "—"] = card.levelBadge.replace(/^漢検 /u, "").split(" · ");
    return { characterId, track, glyph: card.glyph, on: reading.replace(/^音 /u, ""), kun: sub.replace(/^訓 /u, ""), kanken, jlpt, levelOrd: 1 };
  }
  const [hsk = "—", tier = "—"] = card.levelBadge.split(" · ");
  return { characterId, track, glyph: card.glyph, pinyin: reading, meaning: sub, hsk, tier, levelOrd: 1 };
}

function compareTrack(track: Track, entry: SessionCompareEntry, characterId: number): TrackEntry {
  return trackEntry(track, { glyph: entry.glyph, levelBadge: entry.levelBadge }, entry.reading, "", characterId);
}

function characterFor(card: SessionCard, characterId: number): CharacterEntry {
  const correct = card.options[card.answerIndex] ?? { label: "—", sub: "—" };
  const tracks = card.kind === "compare"
    ? (Object.entries(card.compare ?? {}) as Array<[Track, SessionCompareEntry]>).map(([track, entry]) => compareTrack(track, entry, characterId))
    : [trackEntry(card.track, card, correct.label, correct.sub, characterId)];
  const sentences: ExampleSentence[] = card.sentence ? [{
    id: characterId,
    characterId,
    track: card.track,
    text: card.sentence.text,
    translationKo: card.sentence.translation,
    source: card.sentence.source,
    sourceKind: "corpus",
    targetIndex: card.sentence.targetIndex,
    rank: 0,
  }] : [];
  return { id: characterId, key: card.characterKey, meaningEn: "", meaningKo: "", variants: {}, strokeCount: null, createdAt: 0, tracks, sentences };
}

export function apiCardsToQueue(cards: SessionCard[]): SessionQueueItem[] {
  return cards.map((card, index) => {
    const character = characterFor(card, index + 1);
    if (card.kind === "compare") return { kind: "compare", character, track: card.track };
    return { kind: "reading", character, track: card.track, options: card.options.map((option) => ({ label: option.label, sublabel: option.sub })), answerIndex: card.answerIndex };
  });
}

export function queueCharacters(queue: SessionQueueItem[]): CharacterEntry[] {
  return queue.map((item) => item.character);
}
