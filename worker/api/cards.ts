import type { SessionCard, StartSessionRequest, StartSessionResponse } from "../../src/shared/api";
import type { CharacterEntry, TrackEntry } from "../../src/shared/types";
import { buildQueue, buildUnitTestQueue, meaningFor, readingFor, reviewKey } from "../../src/features/session/buildQueue";
import { listByUnit, listForTracks, listFreshForTracks, listPlacementMembersForTracks } from "../db/characters";
import { listStatesForTracks } from "../db/reviews";
import { listWordsForTracks } from "../db/words";
import { issueUnitTestAttempt, requireUnitTestTarget } from "./unitTest";

const labels = {
  kr: { badge: "한국 · 한자", prompt: "훈음을 고르세요", meaningPrompt: "뜻을 고르세요" },
  jp: { badge: "日本 · 漢字", prompt: "音読みを選べ", meaningPrompt: "意味を選べ" },
  cn: { badge: "中国 · 汉字", prompt: "选择正确的拼音", meaningPrompt: "选择正确的意思" },
} as const;

function promptFor(kind: SessionCard["kind"], track: keyof typeof labels): string {
  if (kind === "meaning") return labels[track].meaningPrompt;
  if (kind === "kun") return "訓読みを選べ";
  return labels[track].prompt;
}

function levelBadge(entry: TrackEntry): string {
  if (entry.track === "kr") return `한자 ${entry.level}`;
  if (entry.track === "jp") return entry.kanken === "未指定" ? entry.jlpt : `${entry.jlpt} · 漢検 ${entry.kanken}`;
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
  if (item.kind === "word") {
    return {
      kind: "word",
      characterKey: item.word.members[0].key,
      wordId: item.word.id,
      memberKeys: item.word.members.map((member) => member.key),
      meaningKo: "한자어",
      meaning: "한자어",
      reading: item.word.reading,
      track: "kr",
      glyph: item.word.glyph,
      levelBadge: `한자어 ${item.word.level}`,
      levelOrd: item.word.levelOrd,
      trackBadge: labels.kr.badge,
      prompt: "한자어 독음을 고르세요",
      sentence: null,
      options: item.options,
      answerIndex: item.answerIndex,
      wordSourceUrl: item.word.sourceUrl,
    };
  }
  const entry = item.character.tracks.find((candidate) => candidate.track === item.track)!;
  const sentence = item.character.sentences.find((candidate) => candidate.track === item.track);
  const base = {
    kind: item.kind,
    characterKey: item.character.key,
    meaningKo: item.character.meaningKo,
    meaning: meaningFor(item.character, item.track).label,
    reading: readingFor(entry).label,
    ...(entry.track === "jp" ? { kun: entry.kun } : {}),
    track: item.track,
    glyph: entry.glyph,
    levelBadge: levelBadge(entry),
    levelOrd: entry.levelOrd,
    trackBadge: labels[item.track].badge,
    prompt: item.kind === "compare" ? "한 글자, 세 소리" : promptFor(item.kind, item.track),
    sentence: sentence ? { text: sentence.text, translation: sentence.translationKo, source: sentence.source, targetIndex: sentence.targetIndex } : null,
  } as const;
  if (item.kind === "compare") return { ...base, kind: "compare", options: [], answerIndex: -1, compare: comparison(item.character) };
  return { ...base, kind: item.kind, options: item.options, answerIndex: item.answerIndex };
}

export async function startSession(db: D1Database, input: StartSessionRequest & { limit: number }, sessionId: string = crypto.randomUUID(), now = Date.now()): Promise<StartSessionResponse> {
  if (input.testOut === true) {
    const track = input.tracks[0];
    await requireUnitTestTarget(db, input.unitId!, track);
    const [targets, characters] = await Promise.all([listByUnit(db, input.unitId!), listForTracks(db, [track])]);
    const random = seededRandom(hashSeed(sessionId));
    const queue = buildUnitTestQueue({ targets, characters, track, random });
    const cards = queue.map(toCard);
    if (queue.length === targets.length * 2 && queue.length > 0) {
      await issueUnitTestAttempt(db, sessionId, input.unitId!, cards.map((card) => ({ characterKey: card.characterKey, answerIndex: card.answerIndex })), now);
    }
    return {
      sessionId,
      cards,
      ...(queue.length === targets.length * 2 && queue.length > 0 ? {} : {
        shortage: {
          code: "insufficient_content" as const,
          tracks: [track],
          message: `Not enough distinct ${track} readings to build a complete unit test`,
        },
      }),
    };
  }
  const [characters, states, candidateRows, words] = await Promise.all([
    listForTracks(db, input.tracks),
    listStatesForTracks(db, input.tracks),
    input.mode === "lesson" ? listFreshForTracks(db, input.tracks, input) : input.mode === "placement" ? listPlacementMembersForTracks(db, input.tracks) : Promise.resolve([]),
    listWordsForTracks(db, input.tracks),
  ]);
  const stateMap = new Map(states.map((state) => [reviewKey(state.characterId, state.track), state]));
  const candidateKeys = new Set(candidateRows.map((row) => reviewKey(row.character_id, row.track)));
  const random = seededRandom(hashSeed(sessionId));
  const queue = buildQueue({ characters, enabledTracks: input.tracks, length: input.limit, mode: input.mode, reviewStates: stateMap, freshKeys: input.mode === "lesson" ? candidateKeys : undefined, placementKeys: input.mode === "placement" ? candidateKeys : undefined, random, words });
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
