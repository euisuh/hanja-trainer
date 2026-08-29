import type { SessionCard, StartSessionRequest, StartSessionResponse } from "../../src/shared/api";
import type { CharacterEntry, TrackEntry } from "../../src/shared/types";
import { buildQueue, readingFor, reviewKey } from "../../src/features/session/buildQueue";
import { listForTracks, listFreshForTracks, listPlacementMembersForTracks } from "../db/characters";
import { listStatesForTracks } from "../db/reviews";

const labels = {
  kr: { badge: "한국 · 한자", prompt: "훈음을 고르세요" },
  jp: { badge: "日本 · 漢字", prompt: "音読みを選べ" },
  cn: { badge: "中国 · 汉字", prompt: "选择正确的拼音" },
} as const;

function levelBadge(entry: TrackEntry): string {
  if (entry.track === "kr") return `한자 ${entry.level}`;
  if (entry.track === "jp") return `漢検 ${entry.kanken} · ${entry.jlpt}`;
  return `${entry.hsk} · ${entry.tier}`;
}

function hashSeed(value: string): number {
  let hash = 2_166_136_261;
  for (const point of value) hash = Math.imul(hash ^ point.codePointAt(0)!, 16_777_619);
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let value = seed || 1;
  return () => {
    value = Math.imul(value ^ value >>> 15, 1 | value);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
}

function shuffleOptions(card: SessionCard, random: () => number): SessionCard {
  if (card.kind === "compare") return card;
  const correct = card.options[card.answerIndex];
  const options = [...card.options];
  for (let index = options.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [options[index], options[swap]] = [options[swap], options[index]];
  }
  return { ...card, options, answerIndex: options.indexOf(correct) };
}

function comparison(character: CharacterEntry): SessionCard["compare"] {
  return Object.fromEntries(character.tracks.map((entry) => [entry.track, {
    glyph: entry.glyph,
    reading: readingFor(entry).label,
    levelBadge: levelBadge(entry),
  }])) as SessionCard["compare"];
}

function toCard(item: ReturnType<typeof buildQueue>[number]): SessionCard {
  const entry = item.character.tracks.find((candidate) => candidate.track === item.track)!;
  const sentence = item.character.sentences.find((candidate) => candidate.track === item.track);
  const base = {
    kind: item.kind,
    characterKey: item.character.key,
    meaningKo: item.character.meaningKo,
    track: item.track,
    glyph: entry.glyph,
    levelBadge: levelBadge(entry),
    levelOrd: entry.levelOrd,
    trackBadge: labels[item.track].badge,
    prompt: item.kind === "compare" ? "한 글자, 세 소리" : labels[item.track].prompt,
    sentence: sentence ? { text: sentence.text, translation: sentence.translationKo, source: sentence.source, targetIndex: sentence.targetIndex } : null,
  } as const;
  if (item.kind === "compare") return { ...base, kind: "compare", options: [], answerIndex: -1, compare: comparison(item.character) };
  return { ...base, kind: "reading", options: item.options, answerIndex: item.answerIndex };
}

export async function startSession(db: D1Database, input: StartSessionRequest & { limit: number }, sessionId: string = crypto.randomUUID()): Promise<StartSessionResponse> {
  const [characters, states, candidateRows] = await Promise.all([
    listForTracks(db, input.tracks),
    listStatesForTracks(db, input.tracks),
    input.mode === "lesson" ? listFreshForTracks(db, input.tracks, input) : input.mode === "placement" ? listPlacementMembersForTracks(db, input.tracks) : Promise.resolve([]),
  ]);
  const stateMap = new Map(states.map((state) => [reviewKey(state.characterId, state.track), state]));
  const candidateKeys = new Set(candidateRows.map((row) => reviewKey(row.character_id, row.track)));
  const random = seededRandom(hashSeed(sessionId));
  const queue = buildQueue({ characters, enabledTracks: input.tracks, length: input.limit, mode: input.mode, reviewStates: stateMap, freshKeys: input.mode === "lesson" ? candidateKeys : undefined, placementKeys: input.mode === "placement" ? candidateKeys : undefined, random });
  return {
    sessionId,
    cards: queue.map(toCard).map((card) => shuffleOptions(card, random)),
    ...(queue.length === 0 && input.mode !== "review" ? {
      shortage: {
        code: "insufficient_content" as const,
        tracks: input.tracks,
        message: `Not enough distinct ${input.tracks.join(", ")} readings to build four-option cards`,
      },
    } : {}),
  };
}
